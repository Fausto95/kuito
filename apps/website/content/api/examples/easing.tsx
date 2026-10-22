// Ease a panel into place over a fixed duration.
import { Box, Button, VStack, easing, motion, timing } from 'kuito';

export function Panel() {
  const x = motion(0);
  return (
    <VStack>
      <Button onPress={() => (x.value = timing({ duration: 250, easing: easing.out }).to(120))}>
        Move
      </Button>
      <Box translateX={x} width={80} height={80} backgroundColor="#2563eb" />
    </VStack>
  );
}
