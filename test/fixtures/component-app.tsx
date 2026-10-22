import { clamp } from 'lodash-es';
import { signal, VStack, Text, Button } from 'kuito';

function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button
        onPress={() => {
          count.value = clamp(count.value + 1, 0, 100);
        }}
      >
        Increment
      </Button>
    </VStack>
  );
}

export default function App() {
  return <Counter />;
}
