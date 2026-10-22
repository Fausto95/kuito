# WebView

`WebView` zeigt eine Webseite an: `WKWebView` auf iOS und die System-
`android.webkit.WebView` auf Android, ohne zusätzliche Abhängigkeit. Es folgt
der Kern-API von react-native-webview. Es ist eine [native View](native-modules.md#views), nimmt
also Style- und Layout-Props entgegen und braucht eine Größe.

```tsx
import { Button, WebView, webViewRef } from 'kuito';

const page = webViewRef(); // while a component sets up, like ref()

<WebView
  ref={page}
  flex={1}
  src="https://example.com"
  onMessage={(event) => console.log('page says', event.data)}
/>;

<Button onPress={() => void page.current?.goBack()}>
  {page.canGoBack.value ? 'Back' : 'No back'}
</Button>;
```

`webViewRef()` erzeugt eine Ref, die auch den Zustand der Seite als Signale hält,
gepflegt durch ihre Lade- und Navigationsereignisse: `url`, `title`, `loading`, `canGoBack` und
`canGoForward`. Eine einfache `ref<WebViewHandle>()` genügt für die Methoden allein.

```tsx
void page.current?.reload();
```

## Props

| Prop                 | Standard                    | Was sie tut                                                                                                           |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src`                | leere Seite                 | Eine URL oder `{ uri, headers? }`, um Request-Header zu senden.                                                       |
| `html`               | keins                       | Inline-HTML oder `{ html, baseUrl? }`, um es gegen eine Basis-URL aufzulösen. `src` oder `html` setzen.               |
| `allowedOrigins`     | `["http://*", "https://*"]` | Wohin die Seite navigieren darf, als Wildcard-Muster. Siehe [Navigation](#navigation).                                |
| `injectedJavaScript` | keins                       | Läuft im Hauptframe bei jedem Laden eines Dokuments.                                                                  |
| `javaScriptEnabled`  | `true`                      | Die eigenen Skripte der Seite. Ausgeschaltet führt iOS weiterhin die der App aus (Bridge, injizierte); Android keine. |
| `swipeNavigation`    | `false`                     | iOS: vom Rand wischen, um zurück oder vorwärts zu gehen. Android hat diese Geste nicht und ignoriert sie.             |
| `userAgent`          | der der Plattform           | Ersetzt den User-Agent.                                                                                               |

Ein neues `src` oder `html` wird nur geladen, wenn es sich vom aktuellen unterscheidet; ein
reaktiver Wert, der denselben Wert neu berechnet, lädt die Seite also nicht neu.

`injectedJavaScript` läuft auf iOS, sobald das Dokument geparst ist (ein User Script
vom Typ document-end), und auf Android, sobald die Seite fertig geladen ist
(`onPageFinished`).

## Ereignisse

Der Handler erhält das Ereignis mit seinen Feldern direkt darauf: `event.url`, nicht
`event.nativeEvent.url` wie bei react-native-webview.

| Ereignis      | Wann                                                         | Felder                                                 |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `onLoadStart` | Ein Ladevorgang des Hauptframes beginnt.                     | `url`, `title`, `loading`, `canGoBack`, `canGoForward` |
| `onLoad`      | Er ist geladen.                                              | dieselben                                              |
| `onLoadEnd`   | Er ist beendet, geladen oder fehlgeschlagen.                 | dieselben                                              |
| `onError`     | Er ist fehlgeschlagen.                                       | dieselben, mit `code` und `description` der Plattform  |
| `onNavigate`  | URL, Titel, Ladezustand oder Verlauf haben sich geändert.    | dieselben                                              |
| `onMessage`   | Die Seite hat `window.KuitoWebView.postMessage` aufgerufen. | `data`, der gepostete String; `url`, die URL der Seite |

`onNavigate` feuert auch bei einer Navigation innerhalb desselben Dokuments
(`history.pushState`, ein `#fragment`), die keine Ladeereignisse hat. Auf iOS
erzeugt Inline-`html` keinen Verlaufseintrag: `canGoBack` bleibt false, bis
die Seite weiter zu einer URL navigiert. Auf Android bleibt die `url` einer Inline-HTML-Seite
bei `history.pushState` ihre `baseUrl`, und Chromium überspringt Verlaufseinträge,
die eine Seite von sich aus hinterlassen hat, ohne Tipp: nachdem ein Skript
`location` gesetzt hat, kann `canGoBack` dort false sein, während iOS true meldet.

`onLoad` kann auf iOS einen leeren `title` tragen: WebKit setzt den Titel, nachdem der
Ladevorgang abgeschlossen ist, und `onNavigate` meldet ihn. Ein Ladevorgang, den
ein anderer ersetzt, meldet keinen Fehler. `code` ist ein `NSURLError`-Code
auf iOS und ein `WebViewClient.ERROR_*`-Code auf Android.

## Ref-Methoden

| Methode                    | Was sie tut                                                                    |
| -------------------------- | ------------------------------------------------------------------------------ |
| `goBack()`, `goForward()`  | Durch den Verlauf der Seite.                                                   |
| `reload()`, `stop()`       |                                                                                |
| `injectJavaScript(script)` | Führt `script` im Hauptframe aus. Ergebnis und Fehler bleiben in der Seite.    |
| `postMessage(data)`        | Löst ein `MessageEvent` auf dem `window` der Seite aus, mit dem String `data`. |

Es sind die [Methoden](native-modules.md#how-views-work) der View: Jede gibt ein
Promise zurück, das aufgelöst wird, sobald die Plattform die Arbeit begonnen hat, nicht wenn die
Seite sie abgeschlossen hat, und das mit `ERR_VIEW_NOT_FOUND` abgelehnt wird, sobald die WebView
unmontiert ist. Vor dem Posten an eine noch ladende Seite auf `onLoad` oder eine
Nachricht der Seite warten.

## Nachrichten

Die Seite spricht mit der App über ein einziges Objekt, `window.KuitoWebView`, mit
einer Methode:

```js
// In the page
window.KuitoWebView.postMessage(JSON.stringify({ type: 'ready' }));
window.addEventListener('message', (event) => console.log(event.data));
```

```tsx
// In the app
<WebView ref={page} onMessage={(event) => handle(JSON.parse(event.data))} />;
void page.current?.postMessage(JSON.stringify({ type: 'hello' }));
```

Nachrichten sind Strings: Für strukturierte Daten JSON posten. `postMessage` wandelt
alles andere in einen String um. Auf iOS erhält nur der Hauptframe die Bridge; auf
Android legt `addJavascriptInterface` sie in jeden Frame, iframes eingeschlossen.
`event.url` prüfen, bevor einer Nachricht vertraut wird, und nicht vertrauenswürdige Origins
mit `allowedOrigins` fernhalten.

## Navigation

`allowedOrigins` entscheidet jede Hauptframe-Navigation synchron, auf der
Plattform, anhand des Origins der URL (`scheme://host[:port]`): `*` passt auf jede
Zeichenfolge, ohne Beachtung der Groß-/Kleinschreibung. `https://*.example.com` erlaubt jede
Subdomain, nicht `example.com` selbst. `about:`-Seiten laden immer.

Eine Navigation außerhalb der Whitelist wird abgebrochen. Ist der Benutzer einem
Link dorthin gefolgt, öffnet sich die URL über [Linking](linking.md), im Browser oder
der App, die sie behandelt; eine Seite, die von sich aus umleitet oder `location` setzt,
wird nur gestoppt, sodass sie ohne Tipp keine anderen Apps öffnen kann. Das übergebene
`src`, Zurück/Vorwärts und Neuladen laden immer. Frames innerhalb der Seite werden nicht
geprüft. `target="_blank"`-Links und `window.open` laden in derselben View,
durch die Whitelist.

### Warum es kein `onShouldStartLoadWithRequest` gibt

Das `onShouldStartLoadWithRequest` von react-native-webview fragt JavaScript,
ob jede URL geladen werden soll. Androids `shouldOverrideUrlLoading` muss
auf dem UI-Thread antworten, bevor es zurückkehrt; eine JavaScript-Antwort bedeutet also, den
UI-Thread auf den JS-Thread warten zu lassen. react-native-webview tut das, mit einem Timeout.
Die Alternative, jede Navigation abzubrechen und die erlaubten erneut zu laden,
verliert POST-Bodies und den Verlauf. Kuito führt für die Entscheidung kein JavaScript aus:
Die Whitelist ist Daten, die die Plattform selbst abgleicht. iOS könnte asynchron
fragen, aber beide Plattformen behalten dieselbe API.

## Sicherheit

- **Ein Bridge-Objekt.** Die Seite sieht `window.KuitoWebView` mit
  `postMessage` und sonst nichts: kein Modul, kein natives Objekt, kein Datei- oder
  Netzwerkzugriff über die App.
- **Kein Dateizugriff.** Datei- und Content-URLs laden nicht: Android schaltet
  `allowFileAccess` und `allowContentAccess` aus, und iOS lädt eine `file:`-URL nur
  über `loadFileURL`, das Kuito nicht aufruft.
- **Keine gemischten Inhalte.** Android verwendet `MIXED_CONTENT_NEVER_ALLOW`: Eine https-Seite
  lädt nichts über http. WebKit blockiert gemischte aktive Inhalte (Skripte,
  Stylesheets, Frames, Requests) und hat keinen Schalter, um sie zu erlauben.
- **Keine neuen Fenster, keine Datei-Uploads.** `window.open` und `target="_blank"`
  bleiben in der View; `<input type="file">` tut nichts. Downloads werden ebenfalls nicht behandelt:
  Ein Link auf eine Datei tut auf Android nichts und zeigt auf iOS die Datei an, wenn WebKit
  es kann.

- **Standort nur mit Erlaubnis der App.** Auf Android wird einer Seite, die nach dem
  Standort fragt, dies verweigert. Auf iOS fragt WebKit den Benutzer, unter der eigenen
  Standortberechtigung der App, nur wenn die App eine deklariert (die
  `NSLocationWhenInUseUsageDescription` des Location-Moduls); andernfalls wird es der Seite verweigert.

## Cookies und Speicher

Eine WebView behält den Standardspeicher der Plattform, geteilt von jeder WebView in der
App und über Starts hinweg erhalten:

- **iOS:** `WKWebsiteDataStore.default()`: Cookies, Local Storage und
  Caches. Er wird nicht mit Safari oder mit `URLSession` geteilt, sodass `fetch` aus
  der App die Cookies der Seite nicht sendet, und umgekehrt.
- **Android:** `CookieManager.getInstance()`, mit eingeschaltetem DOM Storage. Drittanbieter-Cookies
  sind aus, der Plattformstandard. Das eigene `fetch` der App teilt ihn
  ebenfalls nicht.

Es gibt noch keine API, um Cookies zu lesen oder zu löschen.

## Debugging

In einem Entwicklungs-Build sind Seiten inspizierbar: Das Entwickler-Menü von Safari listet
die WebViews des Simulators oder Geräts (`isInspectable`, ab iOS 16.4),
und Chromes `chrome://inspect` listet die eines Android-Geräts
(`setWebContentsDebuggingEnabled`). Sie sind nicht Teil des Debuggers von `kuito dev`,
der sich an Hermes hängt: Eine Seite läuft in der JavaScript-Engine der Plattform,
nicht in Hermes.

## Layout und Scrollen

Eine WebView hat keine intrinsische Größe: Ihr eine `height` geben, oder `flex` in einem
Elternelement mit Größe. Innerhalb eines `Scroll` scrollt zuerst die Seite; auf Android
übernimmt der `Scroll` die Geste, sobald die Seite ihren Rand erreicht, und auf iOS
tun die verschachtelten Scroll-Views von UIKit dasselbe.
