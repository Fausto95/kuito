import {
  Box,
  HStack,
  Pressable,
  Text,
  VStack,
  clamp,
  interpolate,
  motion,
  pan,
  pinch,
  spring,
} from 'kuito';
import { colors } from '../theme';

/**
 * Gestures are values a motion value follows: the UI thread moves the card
 * and the photo with the finger, and lets go as release says. No handler.
 */
export function GesturesDemo() {
  const swipe = pan({ axis: 'x' }).release(spring().to([-360, 0, 360]));
  const x = motion(0).follows(swipe.x);
  const zoom = pinch().release(spring());
  const scale = motion(1).follows(zoom.scale);

  return (
    <VStack gap={12}>
      <Box
        id="swipe-card"
        height={120}
        alignItems="center"
        justifyContent="center"
        borderRadius={12}
        backgroundColor={colors.accent}
        translateX={x}
        rotate={x.map((value) => value / 24)}
        opacity={interpolate(x, [-240, 0, 240], [0, 1, 0])}
        gestures={[swipe]}
      >
        <Text fontSize={15} fontWeight={600} color="#ffffff">
          Swipe me away
        </Text>
      </Box>
      <HStack gap={12} alignItems="center">
        <Box
          id="zoom-photo"
          width={120}
          height={120}
          borderRadius={24}
          backgroundColor={colors.accentSoft}
          scale={clamp(scale, 1, 3)}
          gestures={[zoom]}
        />
        <Pressable onPress={() => (x.value = spring().to(0))}>
          <Text fontSize={15} color={colors.accent}>
            Bring the card back
          </Text>
        </Pressable>
      </HStack>
      <Text fontSize={15} color={colors.muted}>
        Swipe the card, pinch the square.
      </Text>
    </VStack>
  );
}
