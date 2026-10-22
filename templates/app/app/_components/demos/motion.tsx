import {
  Box,
  Pressable,
  HStack,
  VStack,
  Text,
  motion,
  sequence,
  spring,
  signal,
  timing,
} from 'kuito';
import { colors } from '../theme';

export function MotionDemo() {
  const right = signal(false);
  const x = motion(0);
  const scale = motion(1);

  const move = () => {
    right.value = !right.value;
    x.value = spring({ damping: 12 }).to(right.value ? 220 : 0);
    scale.value = sequence(timing({ duration: 100 }).to(0.8), spring().to(1));
  };

  return (
    <VStack gap={12}>
      <Box height={72} padding={8} borderRadius={12} backgroundColor={colors.accentSoft}>
        <Box
          width={56}
          height={56}
          borderRadius={28}
          backgroundColor={colors.accent}
          translateX={x}
          scale={scale}
        />
      </Box>
      <HStack>
        <Pressable
          flex={1}
          alignItems="center"
          padding={12}
          borderRadius={12}
          backgroundColor={colors.accent}
          pressedScale={0.97}
          onPress={move}
        >
          <Text fontSize={16} fontWeight={600} color="#ffffff">
            {right.value ? 'Spring back' : 'Spring across'}
          </Text>
        </Pressable>
      </HStack>
    </VStack>
  );
}
