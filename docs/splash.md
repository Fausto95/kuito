# Splash screen

The splash screen is the launch screen the system shows while the app starts:
one logo over one color, and an optional brand at the bottom. Kuito generates
it for both platforms from `kuito.config.ts`, so it looks the same on iOS and
on every Android version from 8 to 16. It stays up until the app's first
screen is on screen, then hands off to a Kuito view the app can animate and
fill with live content.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
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

| Key               | Effect                                                                               |
| ----------------- | ------------------------------------------------------------------------------------ |
| `logo`            | A PNG, drawn `logoWidth` wide in the middle of the screen. Required.                 |
| `logoWidth`       | In points (iOS) and dp (Android), from 1 to 288. `100`.                              |
| `background`      | A color like `#1E88E5`. `#FFFFFF`.                                                   |
| `brand`           | A PNG fitted into a 200×80 box, centered 60 from the bottom of the screen. Optional. |
| `dark`            | `logo`, `background` and `brand` in dark mode; each falls back to its light one.     |
| `variants.<name>` | Another look, the splash with these keys replaced: see [Variants](#variants).        |

Every key is overridable per [environment](apps.md#environments), one by one:
`staging: { splash: { background } }` keeps the logo. Variants inherit the
environment's splash too. Paths are relative to `kuito.config.ts`.

The logo is drawn at its own shape: 120 wide for a 2:1 PNG is 120×60. Each
PNG must be big enough for the densest screens, 4× its size in points: a
120-point logo needs 480 pixels across, a brand 800×320 for a full box. A
smaller one is an error naming its key. Draw the logo with room around it:

- **Android 12 and later** show the splash icon through a 192dp circle. A logo
  whose diagonal is longer than 192 has its corners cut there, so the build
  warns with the widest `logoWidth` that fits.
- The brand box is 200×80 because that is the size Android 12's SplashScreen
  gives a branding image; the other platforms use the same box so the brand
  sits in the same place everywhere.

## Until the app is ready

The native splash stays up while Hermes starts and the app renders its first
screen, and goes in the frame that shows that screen: no white or blank frame
in between, with no code in the app.

```tsx
import { signal, splash } from 'kuito';

declare function loadSession(): Promise<void>;

const screen = signal<'loading' | 'home'>('loading');

splash.hold(); // before the first render: keep it up

export async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

| API                     | Effect                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `splash.hold()`         | Keeps the splash up after the first screen, until `hide`. Call it before the first render.                   |
| `splash.hide({ fade })` | Hides it once the views the app rendered so far are on screen; `fade` takes 250 ms. Settles when it is gone. |
| `splash.visible`        | A signal: whether the native splash is up. Watched, it turns `false` once the splash is gone.                |
| `splash.layout()`       | The logo's and brand's frames in the window (points, dp); null without a splash.                             |
| `splash.variant`        | A writable signal: [variants](#variants).                                                                    |

How the platforms keep it up and hand over:

- **iOS** shows the launch storyboard until the app's window draws. The shell
  instantiates the same storyboard over its root view before that first draw,
  so the system's snapshot and the shell's view are the same pixels, and
  removes it in the same Core Animation transaction as the batch that draws
  the app's first screen.
- **Android** keeps the system's splash (the starting window before Android
  12, the SplashScreen API's view after) by holding the window's first draw
  until the app's first frame is applied: the keep-on-screen condition, as an
  `OnPreDrawListener`. The shell draws the same layer list over its root, so
  when the window draws, the system's splash gives way to identical pixels.
  On Android 12 and later the shell takes the system's splash view and lets
  its icon animation finish before removing it.
- `hide` waits for the batches the app sent before it: a native module call
  made during a JS task starts after that task's view changes reach the main
  thread ([native modules](native-modules.md#how-it-works)), and the splash
  goes in the frame that applies them. `hide` after setting the state of the
  next screen shows that screen, never the one before it.
- The shell's dev loading screen never shows under the splash. If the app
  fails to start (a fatal error), the splash goes so the error shows.

**The first frame with content** is the frame that applies the first batch
in which the renderer creates a view the app rendered (its `onUpdate`, which
also fires when it sets a prop of one). A batch that creates nothing, as an
app whose first screen renders nothing while it loads, leaves the splash up,
and so does UI-thread motion, which moves views without a batch. The launch
screen is the shell's own (`KuitoSplash`, in `native/ios/App/Shell` and
`dev.kuito.runtime.shell`), so an app that never calls `splash` hides it in
that frame too, and its shell holds no `Splash` module; `splash.hold()`
and `splash.hide()` are what the module adds (`native/ios/Tests/KuitoSplashTests.swift`
and `KuitoSplashTest.kt` hold both platforms to this).

## Animated: SplashScreen

> **Frozen.** `SplashScreen` and `SplashPart` stay as they are and get no new
> features until an app asks for one: a niche worth keeping working, not
> growing. Bug fixes still land. A feature request goes in an issue first.

`SplashScreen` draws the launch screen again with Kuito views, at the frames
`splash.layout()` reports, from the same images and colors. The native splash
hands off to it with no visible change, and then it is a regular view: the app
animates it with props and [motion values](motion.md), on the UI thread, and
removes it.

```tsx
import { Box, motion, signal, timing, Show, SplashScreen, Text } from 'kuito';

const Home = () => <Text>Home</Text>;

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

- Render it at the root, over the app, in the first screen: its frames are the
  window's. The native splash hides after the first frame as usual, which
  reveals the `SplashScreen` drawn under it, pixel for pixel.
- Its own props (`opacity`, `scale`, `translateY`, any view prop) apply to the
  whole splash; `logo` and `brand` take the same props for those parts. Each
  is a value, an animation or a motion value ([Motion](motion.md)).
- `onReady` runs once the native splash is gone and this view is what shows:
  start the animation there. It runs at mount when there is nothing to wait
  for (after a reload, or without a splash in the config, where it draws
  nothing).
- No thread is named: the compiler and the kernel run the animation on the UI
  thread ([motion values](placement.md)).

The parts are `SplashPart` views, a native view of the `Splash` module
([native views](native-modules.md#views)) that draws the launch screen's own asset
catalog images and named color on iOS and its resources on Android, so they
follow dark mode as the launch screen does.

## Dynamic

After the native phase the splash is a regular view, so it can show anything
in the same layout: children of `SplashScreen` draw over the launch screen.

```tsx
import { SplashScreen, Text, signal, splash } from 'kuito';

export function Loading() {
  const progress = signal(0);
  const { logo } = splash.layout() ?? { logo: { y: 0, height: 0 } };

  const load = async () => {
    for (const step of [25, 50, 75, 100]) {
      await fetch(`https://api.example.com/warmup/${step}`);
      progress.value = step;
    }
  };

  return (
    <SplashScreen onReady={load}>
      <Text
        position="absolute"
        top={logo.y + logo.height + 32}
        left={0}
        right={0}
        textAlign="center"
      >
        {`Loading ${progress.value}%`}
      </Text>
    </SplashScreen>
  );
}
```

Progress, a loading message, a remote or seasonal image: whatever the app
renders. Keep the app's work for after the first screen (as `load` does),
since the native phase is static until then.

Dark mode follows the system on both platforms, in the native phase and in
`SplashScreen`: the colors and images have dark variants when `splash.dark`
sets them.

### Variants

`splash.variants` declares other looks. What each platform can do with them is
set by the system, not by Kuito:

| Platform             | Next launch                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 13 and later | `splash.variant.value = 'holiday'` picks the theme the system draws its splash with, through `SplashScreen.setSplashScreenTheme`, and the shell draws the same look. `null` goes back to the default. |
| Android 8 to 12      | The system draws the theme the manifest names, always the default: a write is rejected with `ERR_UNSUPPORTED`, reported through the error seam, and the signal goes back.                             |
| iOS                  | One launch screen, named in Info.plist at build time and cached by the system as a snapshot. No API changes it, so a write is rejected with `ERR_UNSUPPORTED`, as on Android 8 to 12.                 |

`splash.variant` starts as the variant this launch showed, null for the default. On
every platform the app can still show anything after the handoff: a
`SplashScreen` with seasonal children, or its own view in the same layout.

## What the CLI generates

On each build the CLI turns the config into each platform's launch screen in
`.kuito/` (`src/cli/splash-screens.ts`), and skips it when neither the config
nor an image changed since the last build. Images are resampled by the same PNG
codec as [app icons](apps.md#app-icons).

- **iOS**: `.kuito/ios/Splash/`, a launch storyboard (`Splash.storyboard`,
  which Info.plist's `UILaunchStoryboardName` names) and its asset catalog: the
  logo and brand at 2x and 3x with their dark appearances, and the background
  as a named color with its dark appearance. Without a splash the app gets a
  blank `UILaunchScreen`.
- **Android**: `.kuito/android/splash/`, a theme the activity starts in,
  `Theme.Kuito.Splash`, derived from the app's `AppTheme` ([native settings](apps.md#native-settings)):
  - **Android 8 to 11** (API 26–30): the starting window draws the theme's
    window background, a layer list of the color, the logo centered at
    `logoWidth` and the brand.
  - **Android 12 and later**: the SplashScreen API draws the theme's
    `windowSplashScreenBackground`, the logo as a 288dp
    `windowSplashScreenAnimatedIcon` with the logo at its own size in the
    middle, and the brand as `windowSplashScreenBrandingImage`. The logo
    lands on the same pixels as before Android 12.
  - Dark mode is `values-night` and `drawable-night` resources, and every
    image is generated from mdpi to xxxhdpi. `raw/kuito_splash.json` tells the
    shell each look's layout.

iOS caches the launch screen: after changing the splash, delete the app (or
restart the simulator) to see the new one. Android reads it on every launch.

## Credits

The approach, one config generating each platform's launch screen and a view
that takes over from it, comes from
[react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash)
(MIT, Mathieu Acthernoene).
