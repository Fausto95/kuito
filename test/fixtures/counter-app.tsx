import { Pressable, Text, VStack, computed, signal } from 'kuito';

/** A component placed whole with a value derived from its signal. */
function Counter() {
  const count = signal(1);
  const doubled = computed(() => count.value * 2);

  return (
    <Pressable id="counter" label="Add" opacity={doubled.value / 10} onPress={() => count.value++}>
      <Text id="doubled">{doubled.value} doubled</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <VStack>
      <Counter />
    </VStack>
  );
}
