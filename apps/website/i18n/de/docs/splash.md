# Splash-Screen

Der Splash-Screen ist der Startbildschirm, den das System zeigt, während die App
startet: ein Logo auf einer Farbe und optional eine Marke am unteren Rand. Kuito
generiert ihn für beide Plattformen aus `kuito.config.ts`, sodass er auf iOS und
auf jeder Android-Version von 8 bis 16 gleich aussieht. Er bleibt stehen, bis der
erste Bildschirm der App zu sehen ist, und übergibt dann an eine Kuito-View, die
die App animieren und mit Live-Inhalten füllen kann.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  // name, ios, android...
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
    variants: { holiday: { logo: './assets/splash-holiday.png', background: '#C62828' } },
  },
  environments: {
    staging: { splash: { background: '#FF8115' } },
  },
} satisfies KuitoConfig;
```

| Schlüssel         | Wirkung                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `logo`            | Ein PNG, `logoWidth` breit in der Mitte des Bildschirms gezeichnet. Erforderlich.                      |
| `logoWidth`       | In Punkten (iOS) und dp (Android), von 1 bis 288. `100`.                                               |
| `background`      | Eine Farbe wie `#1E88E5`. `#FFFFFF`.                                                                   |
| `brand`           | Ein PNG, in eine 200×80-Box eingepasst, zentriert 60 über dem unteren Bildschirmrand. Optional.        |
| `dark`            | `logo`, `background` und `brand` im Dark Mode; jedes fällt auf sein helles Gegenstück zurück.          |
| `variants.<name>` | Ein weiteres Erscheinungsbild, der Splash mit diesen Schlüsseln ersetzt: siehe [Varianten](#variants). |

Jeder Schlüssel ist pro [Umgebung](apps.md#environments) einzeln überschreibbar:
`staging: { splash: { background } }` behält das Logo. Varianten erben ebenfalls
den Splash der Umgebung. Pfade sind relativ zu `kuito.config.ts`.

Das Logo wird in seiner eigenen Form gezeichnet: 120 breit für ein 2:1-PNG ergibt
120×60. Jedes PNG muss groß genug für die dichtesten Bildschirme sein, das
4-Fache seiner Größe in Punkten: ein 120-Punkt-Logo braucht 480 Pixel Breite,
eine Marke 800×320 für eine volle Box. Ein kleineres ist ein Fehler, der seinen
Schlüssel benennt. Das Logo sollte mit Freiraum ringsum gezeichnet werden:

- **Android 12 und neuer** zeigen das Splash-Icon durch einen 192-dp-Kreis. Ein
  Logo, dessen Diagonale länger als 192 ist, bekommt dort seine Ecken
  abgeschnitten, daher warnt der Build mit der breitesten `logoWidth`, die passt.
- Die Marken-Box ist 200×80, weil das die Größe ist, die der SplashScreen von
  Android 12 einem Branding-Bild gibt; die anderen Plattformen verwenden dieselbe
  Box, damit die Marke überall an derselben Stelle sitzt.

## Bis die App bereit ist

Der native Splash bleibt stehen, während Hermes startet und die App ihren ersten
Bildschirm rendert, und verschwindet in dem Frame, der diesen Bildschirm zeigt:
kein weißer oder leerer Frame dazwischen, ohne Code in der App.

```tsx
import { splash } from 'kuito';

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

| API                     | Wirkung                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `splash.hold()`         | Hält den Splash nach dem ersten Bildschirm, bis `hide`. Vor dem ersten Rendern aufrufen.                                                       |
| `splash.hide({ fade })` | Blendet ihn aus, sobald die bis dahin gerenderten Views der App zu sehen sind; `fade` dauert 250 ms. Wird aufgelöst, wenn er verschwunden ist. |
| `splash.visible`        | Ein Signal: ob der native Splash steht. Beobachtet, wird es `false`, sobald der Splash verschwunden ist.                                       |
| `splash.layout()`       | Die Rahmen von Logo und Marke im Fenster (Punkte, dp); null ohne Splash.                                                                       |
| `splash.variant`        | Ein beschreibbares Signal: [Varianten](#variants).                                                                                             |

Wie die Plattformen ihn halten und übergeben:

- **iOS** zeigt das Launch-Storyboard, bis das Fenster der App zeichnet. Die
  Shell instanziiert dasselbe Storyboard über ihrer Root-View vor diesem ersten
  Zeichnen, sodass der Schnappschuss des Systems und die View der Shell dieselben
  Pixel sind, und entfernt es in derselben Core-Animation-Transaktion wie den
  Batch, der den ersten Bildschirm der App zeichnet.
- **Android** behält den Splash des Systems (das Startfenster vor Android 12, die
  View der SplashScreen-API danach), indem es das erste Zeichnen des Fensters
  zurückhält, bis der erste Frame der App angewendet ist: die
  Keep-on-Screen-Bedingung, als `OnPreDrawListener`. Die Shell zeichnet dieselbe
  Layer-Liste über ihre Root, sodass der Splash des Systems beim Zeichnen des
  Fensters identischen Pixeln weicht. Ab Android 12 übernimmt die Shell die
  Splash-View des Systems und lässt deren Icon-Animation zu Ende laufen, bevor sie
  sie entfernt.
- `hide` wartet auf die Batches, die die App davor gesendet hat: ein Aufruf eines
  nativen Moduls während einer JS-Aufgabe startet, nachdem die View-Änderungen
  dieser Aufgabe den Main-Thread erreicht haben
  ([native Module](native-modules.md#how-it-works)), und der Splash verschwindet
  in dem Frame, der sie anwendet. `hide` nach dem Setzen des Zustands des nächsten
  Bildschirms zeigt diesen Bildschirm, nie den davor.
- Der Dev-Ladebildschirm der Shell erscheint nie unter dem Splash. Wenn die App
  nicht starten kann (ein fataler Fehler), verschwindet der Splash, damit der
  Fehler zu sehen ist.

## Animiert: SplashScreen

`SplashScreen` zeichnet den Startbildschirm erneut mit Kuito-Views, an den
Rahmen, die `splash.layout()` meldet, aus denselben Bildern und Farben. Der native
Splash übergibt ohne sichtbare Änderung an ihn, und danach ist er eine gewöhnliche
View: die App animiert ihn mit Props und [Motion-Werten](motion.md), auf dem
UI-Thread, und entfernt ihn.

```tsx
import { Box, motion, signal, timing, Show, SplashScreen } from 'kuito';

export default function App() {
  const splash = signal(true);
  const scale = motion(1);
  const opacity = motion(1);

  return (
    <Box flex={1}>
      <Home />
      <Show when={splash.value}>
        <SplashScreen
          opacity={opacity}
          logo={{ scale }}
          onReady={() => {
            scale.value = timing(450).to(6);
            opacity.value = timing({ duration: 450, onEnd: () => (splash.value = false) }).to(0);
          }}
        />
      </Show>
    </Box>
  );
}
```

- Er wird an der Wurzel gerendert, über der App, im ersten Bildschirm: seine
  Rahmen sind die des Fensters. Der native Splash wird wie üblich nach dem ersten
  Frame ausgeblendet, was den darunter gezeichneten `SplashScreen` freilegt, Pixel
  für Pixel.
- Seine eigenen Props (`opacity`, `scale`, `translateY`, jede View-Prop) gelten
  für den ganzen Splash; `logo` und `brand` nehmen dieselben Props für diese
  Teile. Jede ist ein Wert, eine Animation oder ein Motion-Wert
  ([Motion](motion.md)).
- `onReady` läuft, sobald der native Splash verschwunden ist und diese View das
  ist, was zu sehen ist: dort wird die Animation gestartet. Es läuft beim Mount,
  wenn es nichts abzuwarten gibt (nach einem Reload, oder ohne Splash in der
  Config, wo es nichts zeichnet).
- Kein Thread wird benannt: der Compiler und der Kernel führen die Animation auf
  dem UI-Thread aus ([Motion-Werte](placement.md)).

Die Teile sind `SplashPart`-Views, eine native View des `Splash`-Moduls
([native Views](native-modules.md#views)), die die Asset-Catalog-Bilder und die
benannte Farbe des Startbildschirms selbst auf iOS und seine Ressourcen auf
Android zeichnet, sodass sie dem Dark Mode folgen wie der Startbildschirm.

## Dynamisch

Nach der nativen Phase ist der Splash eine gewöhnliche View, sodass er alles im
selben Layout zeigen kann: Kinder von `SplashScreen` zeichnen über den
Startbildschirm.

```tsx
const { logo } = splash.layout() ?? { logo: { y: 0, height: 0 } };

<SplashScreen onReady={load}>
  <Text position="absolute" top={logo.y + logo.height + 32} left={0} right={0} textAlign="center">
    {`Loading ${progress.value}%`}
  </Text>
</SplashScreen>;
```

Fortschritt, eine Lademeldung, ein entferntes oder saisonales Bild: was immer die
App rendert. Die Arbeit der App sollte auf die Zeit nach dem ersten Bildschirm
verschoben werden (wie `load` es tut), da die native Phase bis dahin statisch ist.

Der Dark Mode folgt auf beiden Plattformen dem System, in der nativen Phase und in
`SplashScreen`: die Farben und Bilder haben dunkle Varianten, wenn `splash.dark`
sie setzt.

### Varianten

`splash.variants` deklariert weitere Erscheinungsbilder. Was jede Plattform damit
tun kann, legt das System fest, nicht Kuito:

| Plattform            | Nächster Start                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Android 13 und neuer | `splash.variant.value = 'holiday'` wählt das Theme, mit dem das System seinen Splash zeichnet, über `SplashScreen.setSplashScreenTheme`, und die Shell zeichnet dasselbe Erscheinungsbild. `null` kehrt zum Standard zurück.   |
| Android 8 bis 12     | Das System zeichnet das Theme, das das Manifest nennt, immer den Standard: ein Schreibvorgang wird mit `ERR_UNSUPPORTED` abgelehnt, über die Fehlerschnittstelle gemeldet, und das Signal wird zurückgesetzt.                  |
| iOS                  | Ein Startbildschirm, zur Build-Zeit in Info.plist benannt und vom System als Schnappschuss zwischengespeichert. Keine API ändert ihn, daher wird ein Schreibvorgang mit `ERR_UNSUPPORTED` abgelehnt, wie auf Android 8 bis 12. |

`splash.variant` beginnt als die Variante, die dieser Start gezeigt hat, null für
den Standard. Auf jeder Plattform kann die App nach der Übergabe trotzdem alles
zeigen: einen `SplashScreen` mit saisonalen Kindern oder eine eigene View im selben
Layout.

## Was die CLI generiert

Bei jedem Build wandelt die CLI die Config in den Startbildschirm jeder Plattform
in `.kuito/` um (`src/cli/splash-screens.ts`) und überspringt dies, wenn sich
seit dem letzten Build weder die Config noch ein Bild geändert hat. Bilder werden
mit demselben PNG-Codec neu abgetastet wie [App-Icons](apps.md#app-icons).

- **iOS**: `.kuito/ios/Splash/`, ein Launch-Storyboard (`Splash.storyboard`,
  das `UILaunchStoryboardName` in Info.plist benennt) und sein Asset-Catalog: das
  Logo und die Marke in 2x und 3x mit ihren dunklen Erscheinungsbildern, und der
  Hintergrund als benannte Farbe mit ihrem dunklen Erscheinungsbild. Ohne Splash
  bekommt die App einen leeren `UILaunchScreen`.
- **Android**: `.kuito/android/splash/`, ein Theme, in dem die Activity startet,
  `Theme.Kuito.Splash`, abgeleitet vom `AppTheme` der App ([native Einstellungen](apps.md#native-settings)):
  - **Android 8 bis 11** (API 26–30): das Startfenster zeichnet den
    Fensterhintergrund des Themes, eine Layer-Liste aus der Farbe, dem Logo
    zentriert in `logoWidth` und der Marke.
  - **Android 12 und neuer**: die SplashScreen-API zeichnet den
    `windowSplashScreenBackground` des Themes, das Logo als 288-dp-
    `windowSplashScreenAnimatedIcon` mit dem Logo in seiner eigenen Größe in der
    Mitte, und die Marke als `windowSplashScreenBrandingImage`. Das Logo landet
    auf denselben Pixeln wie vor Android 12.
  - Der Dark Mode sind `values-night`- und `drawable-night`-Ressourcen, und jedes
    Bild wird von mdpi bis xxxhdpi generiert. `raw/kuito_splash.json` teilt der
    Shell das Layout jedes Erscheinungsbilds mit.

iOS cacht den Startbildschirm: nach einer Änderung am Splash die App löschen
(oder den Simulator neu starten), um den neuen zu sehen. Android liest ihn bei
jedem Start.

## Danksagung

Der Ansatz, eine Config, die den Startbildschirm jeder Plattform generiert, und
eine View, die ihn übernimmt, stammt von
[react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash)
(MIT, Mathieu Acthernoene).
