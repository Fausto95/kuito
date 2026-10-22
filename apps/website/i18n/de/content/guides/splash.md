# Splash-Screen

Der Splash-Screen ist der Startbildschirm, den das System zeigt, während die App startet: ein Logo über einer Farbe und optional eine Marke unten. Kuito generiert ihn für beide Plattformen aus `kuito.config.ts`, und er bleibt stehen, bis der erste Screen der App auf dem Bildschirm ist.

## Konfiguration

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
  },
} satisfies KuitoConfig;
```

- `logo`: ein PNG, `logoWidth` breit in der Bildschirmmitte gezeichnet. Erforderlich.
- `logoWidth`: in Punkten (iOS) und dp (Android), von 1 bis 288. Standard ist `100`.
- `background`: eine Farbe wie `#1E88E5`. Standard ist `#FFFFFF`.
- `brand`: ein PNG, in eine 200x80-Box eingepasst, zentriert 60 über dem unteren Rand. Optional.
- `dark`: `logo`, `background` und `brand` im Dunkelmodus; jedes fällt auf sein helles zurück.
- `variants.<name>`: ein anderes Aussehen, der Splash mit diesen Schlüsseln ersetzt.

Jeder Schlüssel ist pro [Umgebung](../../../../docs/apps.md#environments) überschreibbar. Pfade sind relativ zu `kuito.config.ts`. Jedes PNG muss 4x seine Größe in Punkten haben: ein 120-Punkt-Logo braucht 480 Pixel Breite. Android 12 und neuer zeigen das Splash-Icon durch einen 192-dp-Kreis: das Logo mit Platz darum zeichnen.

## Bis die App bereit ist

Der native Splash bleibt stehen, während die App ihren ersten Screen rendert, und verschwindet in dem Frame, der diesen Screen zeigt, ohne Code in der App. Um ihn länger zu halten:

```tsx
import { splash } from 'kuito';

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

- `splash.hold()` hält den Splash nach dem ersten Screen, bis `hide`. Vor dem ersten Rendern aufrufen.
- `splash.hide({ fade })` blendet ihn aus, sobald die bisher von der App gerenderten Views auf dem Bildschirm sind; `fade` dauert 250 ms.
- `splash.visible` ist ein Signal: ob der native Splash steht.
- `splash.layout()` sind die Frames von Logo und Marke im Fenster; null ohne Splash.

`hide` nach dem Setzen des Zustands des nächsten Screens zeigt diesen Screen, nie den davor.

## Animiert: SplashScreen

`SplashScreen` zeichnet den Startbildschirm erneut mit Kuito-Views, aus denselben Bildern und Farben. Der native Splash übergibt ohne sichtbare Änderung an ihn, und dann ist er eine gewöhnliche View, die die App mit Props und [Motion-Werten](../../../../docs/motion.md) animiert und entfernt.

```tsx
import { motion, signal, timing, Show, SplashScreen } from 'kuito';

const splash = signal(true);
const scale = motion(1);
const opacity = motion(1);

<Show when={splash.value}>
  <SplashScreen
    opacity={opacity}
    logo={{ scale }}
    onReady={() => {
      scale.value = timing(450).to(6);
      opacity.value = timing({ duration: 450, onEnd: () => (splash.value = false) }).to(0);
    }}
  />
</Show>;
```

- An der Wurzel rendern, über der App, im ersten Screen: der native Splash verschwindet wie üblich nach dem ersten Frame, was den darunter gezeichneten `SplashScreen` freilegt, Pixel für Pixel.
- Seine eigenen Props (`opacity`, `scale`, `translateY`, jede View-Prop) gelten für den ganzen Splash; `logo` und `brand` nehmen dieselben Props für diese Teile.
- `onReady` läuft, sobald der native Splash verschwunden ist und diese View das ist, was zu sehen ist: dort die Animation starten.

Der Dunkelmodus folgt auf beiden Plattformen dem System, in der nativen Phase und in `SplashScreen`.

## Varianten

`splash.variants` deklariert andere Aussehen, und `splash.variant` ist ein schreibbares Signal, das als die Variante beginnt, die dieser Start gezeigt hat, null für den Standard. Auf Android 13 und neuer wählt `splash.variant.value = 'holiday'` das Theme, mit dem das System seinen nächsten Splash zeichnet, und `null` geht zurück zum Standard. Auf Android 8 bis 12 und iOS wird ein Schreiben mit `ERR_UNSUPPORTED` abgelehnt, und das Signal geht zurück.

## Vertiefung

[Splash-Screen](../../../../docs/splash.md) behandelt dynamische Kinder von `SplashScreen`, wie jede Plattform den Splash hält und übergibt, und was die CLI nach `.kuito/` generiert.
