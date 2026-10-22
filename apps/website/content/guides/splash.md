# Splash screen

The splash screen is the launch screen the system shows while the app starts: one logo over one color, and an optional brand at the bottom. Kuito generates it for both platforms from `kuito.config.ts`, and it stays up until the app's first screen is on screen.

## Configuration

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
  },
} satisfies KuitoConfig;
```

- `logo`: a PNG, drawn `logoWidth` wide in the middle of the screen. Required.
- `logoWidth`: in points (iOS) and dp (Android), from 1 to 288. Defaults to `100`.
- `background`: a color like `#1E88E5`. Defaults to `#FFFFFF`.
- `brand`: a PNG fitted into a 200x80 box, centered 60 from the bottom. Optional.
- `dark`: `logo`, `background` and `brand` in dark mode; each falls back to its light one.
- `variants.<name>`: another look, the splash with these keys replaced.

Every key is overridable per [environment](../../../../docs/apps.md#environments). Paths are relative to `kuito.config.ts`. Each PNG must be 4x its size in points: a 120-point logo needs 480 pixels across. Android 12 and later show the splash icon through a 192dp circle: draw the logo with room around it.

## Until the app is ready

The native splash stays up while the app renders its first screen, and goes in the frame that shows that screen, with no code in the app. To keep it up longer:

```tsx
import { signal, splash } from 'kuito';

const screen = signal<'loading' | 'home'>('loading');
const loadSession = () => fetch('https://example.com/session');

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

- `splash.hold()` keeps the splash up after the first screen, until `hide`. Call it before the first render.
- `splash.hide({ fade })` hides it once the views the app rendered so far are on screen; `fade` takes 250 ms.
- `splash.visible` is a signal: whether the native splash is up.
- `splash.layout()` is the logo's and brand's frames in the window; null without a splash.

`hide` after setting the state of the next screen shows that screen, never the one before it.

## Animated: SplashScreen

`SplashScreen` draws the launch screen again with Kuito views, from the same images and colors. The native splash hands off to it with no visible change, and then it is a regular view the app animates with props and [motion values](../../../../docs/motion.md), and removes.

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

- Render it at the root, over the app, in the first screen: the native splash hides after the first frame as usual, which reveals the `SplashScreen` drawn under it, pixel for pixel.
- Its own props (`opacity`, `scale`, `translateY`, any view prop) apply to the whole splash; `logo` and `brand` take the same props for those parts.
- `onReady` runs once the native splash is gone and this view is what shows: start the animation there.

Dark mode follows the system on both platforms, in the native phase and in `SplashScreen`.

## Variants

`splash.variants` declares other looks, and `splash.variant` is a writable signal that starts as the variant this launch showed, null for the default. On Android 13 and later, `splash.variant.value = 'holiday'` picks the theme the system draws its next splash with, and `null` goes back to the default. On Android 8 to 12 and iOS, a write is rejected with `ERR_UNSUPPORTED`, and the signal goes back.

## In depth

[Splash screen](../../../../docs/splash.md) covers dynamic children of `SplashScreen`, how each platform holds and hands over the splash, and what the CLI generates into `.kuito/`.
