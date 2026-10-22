import { Pressable, Text, VStack, signal } from 'kuito';

/** A component placed whole: its signals live on the UI thread. */
function Toggle({ name }: { name: string }) {
  const on = signal(false);
  const taps = signal(0);

  return (
    <Pressable
      id={name}
      label="Toggle"
      opacity={on.value ? 1 : 0.5}
      onPress={() => {
        on.value = !on.value;
        taps.value++;
      }}
    >
      <Text id={name + '-taps'}>{taps.value} taps</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <VStack>
      <Toggle name="toggle" />
      <Pressable id="outer" label="Outer">
        <Toggle name="inner" />
      </Pressable>
    </VStack>
  );
}
