import { Button, VStack } from 'kuito';

export default function App() {
  return (
    <VStack>
      <Button
        onPress={() => {
          throw new Error('ui boom');
        }}
      >
        Explode on the UI thread
      </Button>
    </VStack>
  );
}
