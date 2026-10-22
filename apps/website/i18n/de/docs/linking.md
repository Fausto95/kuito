# linking

URLs in anderen Apps öffnen und den Links folgen, die diese App öffnen. Auf iOS
ist es `UIApplication.open`; auf Android ein `ACTION_VIEW`-Intent.

```tsx
import { watch, linking } from 'kuito';

await linking.open('https://www.tvmaze.com');
if (await linking.canOpen('mailto:hi@example.com')) await linking.open('mailto:hi@example.com');

linking.url.value; // 'kuito://show/42', or null
watch(linking.url, (url) => console.log(url)); // in a component
```

| Member         | Ist                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `open(url)`    | Öffnet `url` in der App, die sie verarbeitet. Wird mit `ERR_URL` abgelehnt, wenn keine App das tut oder wenn `url` kein Schema hat.         |
| `canOpen(url)` | Ob eine installierte App `url` verarbeitet (siehe unten).                                                                                   |
| `url`          | Ein Signal: der Link, der die App zuletzt geöffnet hat, beginnend mit dem, mit dem sie gestartet wurde, oder `null`. Ein Reload behält ihn. |

`url` wird synchron gelesen. Solange etwas es beobachtet, folgt es jedem Link,
der die App öffnet, während sie läuft; derselbe Link zweimal hintereinander ist
eine Änderung. Die Seite der App in den Einstellungen ist
[`app.openSettings()`](app-state.md).

Zum Navigieren bei Deep Links erledigt das ein `<Router linking>` für Sie
([navigation.md](navigation.md#deep-links)); beobachten Sie `url` selbst nur für
Links, die keine Routen sind.

## canOpen

Beide Plattformen verbergen andere Apps, sofern die App nicht deklariert, wonach
sie fragt:

- iOS antwortet mit `true` für `http` und `https`, und für andere Schemata nur,
  wenn `LSApplicationQueriesSchemes` in `Info.plist` sie auflistet
  (`ios.infoPlist` in [`kuito.config.ts`](apps.md#native-settings)).
- Android 11 und neuer antwortet für die Intents, die das `<queries>`-Element
  des Manifests benennt. Die Shell deklariert `http`, `https`, `mailto`, `tel`
  und `sms`; eine App fügt weitere mit `android.manifest.queries` hinzu.

`open` braucht keines von beiden: Es öffnet, was immer das System kann.

## Das URL-Schema der App

Die Schemata einer App sind `urlSchemes` in [`kuito.config.ts`](apps.md#native-settings):
`urlSchemes: ['myapp']` lässt `myapp://show/42` die App öffnen, über `CFBundleURLTypes` auf iOS
und einen `VIEW`-Intent-Filter mit `<data android:scheme="myapp" />` auf Android. Die
Demo-App dieses Checkouts, Reel, deklariert `kuito`, was die Beispiele hier verwenden. Die Activity ist
`singleTask`, sodass ein Link, der eintrifft, während die App läuft, sie über `onNewIntent`
erreicht, statt eine zweite zu starten.

### Link-Domains

`linkDomains: ['example.com']` lässt die https-Links der Website die App statt des
Browsers öffnen: Universal Links auf iOS, je eine Associated Domain `applinks:example.com`
(neben allen `ios.associatedDomains`, die die App deklariert), und verifizierte App Links auf Android,
ein `autoVerify`-`VIEW`-Intent-Filter für `https://example.com`. Eine Domain ist ein Hostname,
ohne Schema oder Pfad. Die Website beweist, dass der Link zur App gehört: Sie liefert
`/.well-known/apple-app-site-association` mit Team- und Bundle-Identifier der App aus und
`/.well-known/assetlinks.json` mit ihrer applicationId und ihrem Signaturzertifikat. Ohne
diese öffnen iOS und Android weiterhin den Browser.

Ein `<Router linking>` bildet einen solchen Link über seinen Pfad auf eine Route ab, wie bei einem
benutzerdefinierten Schema ([Deep Links](navigation.md#deep-links)): `https://example.com/show/42` ist
`/show/42`.

Probieren Sie einen vom Terminal aus:

```bash
xcrun simctl openurl booted kuito://show/1
```

```bash
adb shell am start -a android.intent.action.VIEW -d kuito://show/1
```

Ein Link, der die Entwicklungs-Shell aus einem Kaltstart startet, führt die in
die Shell gebündelte App aus und erreicht den Dev-Server unter der Standard-URL,
wie es der erste Start über `kuito dev` täte. Ein Release-Build öffnet Links
kalt so wie warm.

## Wie es verdrahtet ist

Die Shell meldet Links an `KuitoLinks` (`native/modules/linking`), und das
Modul `Linking` liest sie dort: den neuesten Link unter einem Lock, für das
synchrone Lesen des JS-Threads. Seine Spezifikation markiert es als `always`,
sodass jede Shell es einbindet
([native Module](native-modules.md#which-modules-a-shell-includes)):

- iOS: die Verbindungsoptionen des Scene-Delegates (der Start-Link oder die
  `webpageURL` eines Universal Links), dann `scene(_:openURLContexts:)` und
  `scene(_:continue:)`.
- Android: der Intent der Activity in `onCreate`, dann `onNewIntent`.

`KuitoLinks` überlebt die Laufzeit, sodass der letzte Link nach einem Reload
erhalten bleibt und Links weiterhin an die jeweils beobachtende Laufzeit
fließen.
