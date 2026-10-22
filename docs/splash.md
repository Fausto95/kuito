# Configure the launch screen

Set launch artwork in configuration, then let it hand off to your first screen. Hold it only for work required before the app can display useful content.

## Set light and dark artwork

Configure a logo, width and background. Optional brand artwork and dark variants are bundled into the native shell; changes need a native rebuild.

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

## Wait for required startup work

Hold the splash before the first content frame and release it after startup work settles. Ensure failures also release it so the app can show a recovery screen.

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

## Animate the handoff

SplashScreen recreates the configured artwork in the app. Start motion from onReady, then remove the overlay. SplashPart allows separate logo, brand and background composition.

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

## Choose the next-launch variant

splash.variant selects a configured variant for a future launch. It does not restyle the currently displayed native launch screen. Platform support differs; verify Android version requirements when using variants.

## Continue

See [SplashScreen](splash-screen.md), [SplashPart](splash-part.md), and [app configuration](apps.md).
