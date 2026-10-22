import {
  VStack,
  Text,
  signal,
  Show,
  accessibility,
  app,
  appearance,
  brightness,
  device,
  keepAwake,
  keyboard,
  localization,
  window,
} from 'kuito';

// The test drives the APIs as an app would, from inside the kernel.
Object.assign(globalThis, {
  accessibility,
  app,
  appearance,
  brightness,
  device,
  keepAwake,
  keyboard,
  localization,
  window,
});

function Reader() {
  keepAwake();

  return <Text>reading</Text>;
}

function Scheme() {
  const warnings = signal(0);

  app.watch('memoryWarning', () => warnings.value++);

  return (
    <Text id="scheme">
      {`${appearance.colorScheme.value} ${app.state.value} ${warnings.value}`}
    </Text>
  );
}

function Screen() {
  return (
    <Text id="screen">
      {`${window.size.value.width}x${window.size.value.height} ${window.orientation.value} ` +
        `top ${window.insets.value.top} keyboard ${keyboard.visible.value} ` +
        `reader ${accessibility.screenReader.value}`}
    </Text>
  );
}

export default function App() {
  const reading = signal(false);
  const scheme = signal(false);
  const screen = signal(false);

  Object.assign(globalThis, {
    setReading: (value: boolean) => (reading.value = value),
    showScheme: (value: boolean) => (scheme.value = value),
    showScreen: (value: boolean) => (screen.value = value),
  });

  return (
    <VStack>
      <Show when={reading.value} fallback={<Text>apis</Text>}>
        <Reader />
      </Show>
      <Show when={scheme.value}>
        <Scheme />
      </Show>
      <Show when={screen.value}>
        <Screen />
      </Show>
    </VStack>
  );
}
