# WebView

`WebView` zeigt eine Webseite an: `WKWebView` auf iOS und das System-`android.webkit.WebView` auf Android, ohne zusätzliche Abhängigkeit. Sie nimmt Style- und Layout-Props an und braucht eine Größe: eine `height` oder `flex` in einem Elternelement mit Größe.

Geeignet für:

- ein Hilfecenter, Nutzungsbedingungen oder eine Seite, die die App nicht nativ nachbaut;
- eine Anmelde- oder Zahlungsseite eines anderen Dienstes;
- HTML, das die App selbst rendert, etwa den Text eines Artikels.

```tsx
import { WebView } from 'kuito';

export default function Help() {
  return <WebView flex={1} src="https://example.com/help" />;
}
```

`src` nimmt eine URL an, oder `{ uri, headers }`, um Request-Header zu senden; `html` nimmt Inline-HTML an, oder `{ html, baseUrl }`. Eines von beiden setzen. Ein neuer Wert wird nur geladen, wenn er sich vom aktuellen unterscheidet.

## Muster

### Zurück- und Vorwärts-Buttons hinzufügen

`webViewRef()` erzeugt eine Ref, die auch den Zustand der Seite als Signale hält: `url`, `title`, `loading`, `canGoBack` und `canGoForward`, aktualisiert durch `onLoadStart`, `onLoad`, `onLoadEnd` und `onError` jedes Ladevorgangs. Eine Änderung ohne Ladevorgang, etwa ein `pushState` oder ein später gesetzter Titel, erreicht nur `onNavigate`.

```tsx
import { Button, HStack, Text, VStack, WebView, webViewRef } from 'kuito';

export default function Browser() {
  const page = webViewRef();

  return (
    <VStack flex={1}>
      <HStack gap={8} padding={8} alignItems="center">
        <Button disabled={!page.canGoBack.value} onPress={() => void page.current?.goBack()}>
          Back
        </Button>
        <Text lineClamp={1}>{page.loading.value ? 'Loading…' : page.title.value}</Text>
      </HStack>
      <WebView ref={page} flex={1} src="https://example.com" />
    </VStack>
  );
}
```

### Mit der Seite kommunizieren

Die Seite spricht über ein einziges Objekt mit der App, `window.KuitoWebView`, mit einer einzigen Methode, `postMessage`. Nachrichten sind Strings: für strukturierte Daten JSON senden. `onMessage` erhält `data` und die `url` der Seite; `url` prüfen, bevor man einer Nachricht vertraut. `postMessage(data)` der Ref löst auf dem `window` der Seite ein `message`-Ereignis aus.

```tsx
import { WebView, webViewRef } from 'kuito';

const PAGE = `<button onclick="window.KuitoWebView.postMessage(JSON.stringify({ type: 'liked' }))">Like</button>
<script>window.addEventListener('message', (event) => (document.body.dataset.theme = event.data));</script>`;

export default function Embed() {
  const page = webViewRef();

  return (
    <WebView
      ref={page}
      flex={1}
      html={{ html: PAGE, baseUrl: 'https://example.com' }}
      onLoad={() => void page.current?.postMessage('dark')}
      onMessage={(event) => {
        if (event.url.startsWith('https://example.com')) console.log(JSON.parse(event.data));
      }}
    />
  );
}
```

Auf `onLoad` oder eine Nachricht der Seite warten, bevor man an eine Seite sendet, die noch lädt.

### Die Navigation auf der eigenen Website halten

`allowedOrigins` entscheidet jede Navigation des Hauptframes anhand des Origins der URL, als Wildcard-Muster. Eine Navigation anderswohin wird abgebrochen; ist der Benutzer einem Link dorthin gefolgt, öffnet sich die URL über [Linking](../../../../docs/linking.md), im Browser oder in der App, die sie verarbeitet.

```tsx
import { WebView } from 'kuito';

export default function Docs() {
  return (
    <WebView
      flex={1}
      src="https://docs.example.com"
      allowedOrigins={['https://docs.example.com', 'https://*.example.com']}
    />
  );
}
```

`https://*.example.com` erlaubt jede Subdomain, nicht aber `example.com` selbst. Das übergebene `src`, Zurück, Vorwärts und Neuladen laden immer.

## Plattformunterschiede

|                       | iOS                                               | Android                             |
| --------------------- | ------------------------------------------------- | ----------------------------------- |
| Engine                | `WKWebView`                                       | Das System-`WebView`                |
| `window.KuitoWebView` | Nur der Hauptframe                                | Jeder Frame, iframes eingeschlossen |
| `swipeNavigation`     | Vom Rand wischen, um zurück- oder vorwärtszugehen | Keine Wirkung                       |

## Barrierefreiheit

Was ein Screenreader vorliest, bestimmt das HTML der Seite selbst: VoiceOver und TalkBack lesen die Seite so vor, wie es der Browser der Plattform tut.

## Siehe auch

- [Linking](../../../../docs/linking.md)
- [WebView im Detail](../../../../docs/webview.md): alle Ereignisse, Sicherheit, Cookies und Debugging
