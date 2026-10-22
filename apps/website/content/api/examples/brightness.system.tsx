// Restore the user's brightness when leaving a temporary bright mode.
import { Button, Text, VStack, brightness, onCleanup } from 'kuito';

export function ReadingMode() {
  onCleanup(() => void brightness.restore());
  return (
    <VStack>
      <Text>{`System brightness: ${brightness.system.value}`}</Text>
      <Button onPress={() => (brightness.level.value = 0.8)}>Bright mode</Button>
      <Button onPress={() => void brightness.restore()}>Use system brightness</Button>
    </VStack>
  );
}
