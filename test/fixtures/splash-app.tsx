import { Text, motion, signal, Show, SplashScreen, splash } from 'kuito';

// The test drives the splash as an app would, from inside the kernel.
Object.assign(globalThis, { splash });

export default function App() {
  const shown = signal(true);
  const scale = motion(1);
  const ready: string[] = [];

  Object.assign(globalThis, {
    ready,
    scale,
    dismiss() {
      shown.value = false;
    },
  });

  return (
    <Show when={shown.value}>
      <SplashScreen
        opacity={0.5}
        logo={{ scale }}
        brand={{ opacity: 0.25 }}
        onReady={() => ready.push('ready')}
      >
        <Text>Loading…</Text>
      </SplashScreen>
    </Show>
  );
}
