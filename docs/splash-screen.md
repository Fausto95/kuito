# SplashScreen

Match the native launch screen with an animated view. Use it to transition the launch artwork into your first screen.

## Animate the launch logo into the app

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

## Behavior

Wait for `onReady` before beginning the handoff animation. Configure the source artwork in `kuito.config.ts`. Remove the overlay after the animation so it no longer covers the app.

## Continue

Read [Splash](splash.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/SplashScreen#members) for types and documented defaults.
