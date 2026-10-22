import { Button, VStack } from 'kuito';

function explode(): never {
  throw new Error('boom');
}

export default function App() {
  return (
    <VStack>
      <Button onPress={() => explode()}>Explode</Button>
    </VStack>
  );
}
