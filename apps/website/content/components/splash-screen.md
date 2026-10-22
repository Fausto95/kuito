# SplashScreen

`SplashScreen` draws the launch screen again with Kuito views, from the same images and colors, so the native splash hands off to it with no visible change. Then it is a regular view: the app animates it away, or draws live content over it.

Use it for:

- a logo that grows and fades into the app's first screen;
- a loading message or progress over the launch screen;
- seasonal content in the launch screen's layout.

```tsx
import { Box, Show, SplashScreen, Text, motion, signal, timing } from 'kuito';

export default function App() {
  const splash = signal(true);
  const scale = motion(1);
  const opacity = motion(1);

  return (
    <Box flex={1}>
      <Text padding={16}>Home</Text>
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

Render it at the root, over the app, in the first screen: its frames are the window's. `onReady` runs once the native splash is gone and this view is what shows, or at mount when there is nothing to wait for, as after a reload: start the animation there. The launch screen itself is configured in `kuito.config.ts` ([splash](../guides/splash.md)).

> **Frozen.** `SplashScreen` and `SplashPart` stay as they are and get no new features until an app asks for one. Bug fixes still land.

## Patterns

### Draw over the launch screen

Children draw over the launch screen in the same layout; `splash.layout()` gives the logo's frame to place them by. Without a splash in the config, SplashScreen draws nothing, children included.

```tsx
import { SplashScreen, Text, signal, splash } from 'kuito';

export default function Starting() {
  const progress = signal(0);
  const { logo } = splash.layout() ?? { logo: { y: 0, height: 0 } };

  return (
    <SplashScreen onReady={() => (progress.value = 10)}>
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

### Animate one part

`logo` and `brand` take a view's props for those parts: values, animations or motion values. Each part is a `SplashPart`, a view of the Splash module that draws the launch screen's own images and color, following dark mode as the launch screen does.

```tsx
import { SplashScreen, motion, timing } from 'kuito';

export default function Lift() {
  const rise = motion(0);

  return (
    <SplashScreen logo={{ translateY: rise }} onReady={() => (rise.value = timing(300).to(-40))} />
  );
}
```

## Platform differences

None in the handoff: both platforms draw the parts from the images and colors the CLI generated for the launch screen, at the frames `splash.layout()` reports.

## Related

- [Splash screen](../guides/splash.md)
- [Motion](../guides/motion.md)
- [SplashScreen in depth](../../../../docs/splash.md#animated-splashscreen)
