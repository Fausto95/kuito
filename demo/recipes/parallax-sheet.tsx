import {
  Blur,
  Box,
  HStack,
  Pressable,
  SafeArea,
  Scroll,
  Sheet,
  Text,
  VStack,
  interpolate,
  scrollMotion,
  sheetMotion,
  signal,
} from 'kuito';

const HEADER = 240;
const ARTWORK = ['#2b2d42', '#8d99ae', '#ef233c', '#d90429', '#edf2f4'];
const EPISODES = Array.from({ length: 12 }, (_, index) => `Episode ${index + 1}`);

/**
 * A bottom sheet whose header scrolls at half speed and stretches when pulled
 * down, under a blurred bar that fades in once the header has gone. The
 * screen behind recedes as the sheet rises. All of it moves on the UI thread.
 */
export default function ParallaxSheet() {
  const open = signal(false);
  const sheet = sheetMotion();
  const body = scrollMotion();
  // The bar shows over the last 60 points before the header scrolls away.
  const barShown = interpolate(body.offset, [HEADER - 120, HEADER - 60], [0, 1]);

  return (
    <SafeArea flex={1} padding={24} gap={16} backgroundColor="#f2f2f7">
      <VStack gap={16} scale={interpolate(sheet.progress, [0, 1], [1, 0.94])}>
        <Text fontSize={34} fontWeight={700}>
          Tonight
        </Text>
        <Pressable
          padding={16}
          borderRadius={12}
          backgroundColor="#1c1c24"
          onPress={() => (open.value = true)}
        >
          <Text color="#ffffff">Severance: see every episode</Text>
        </Pressable>
      </VStack>
      <Sheet open={open} snapPoints={['50%', '100%']} motion={sheet} backgroundColor="#ffffff">
        <Scroll motion={body} flex={1}>
          <HStack
            role="img"
            label="Severance key art"
            height={HEADER}
            translateY={body.offset.map((offset) => Math.max(offset, 0) / 2)}
            scale={interpolate(body.overscroll, [-120, 0], [1.5, 1])}
          >
            {ARTWORK.map((color) => (
              <Box flex={1} backgroundColor={color} />
            ))}
          </HStack>
          <VStack backgroundColor="#ffffff" padding={20} gap={12}>
            <Text role="heading" fontSize={28} fontWeight={700}>
              Severance
            </Text>
            <Text color="#6b6b76" opacity={interpolate(sheet.progress, [0, 1], [1, 0])}>
              Pull up for every episode
            </Text>
            {EPISODES.map((episode) => (
              <Text padding={12}>{episode}</Text>
            ))}
          </VStack>
        </Scroll>
        <HStack
          role="toolbar"
          position="absolute"
          top={0}
          left={0}
          right={0}
          height={56}
          padding={16}
          alignItems="center"
          justifyContent="space-between"
        >
          <Blur
            material="thin"
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            opacity={barShown}
          />
          <Text fontWeight={600} opacity={barShown}>
            Severance
          </Text>
          <Pressable onPress={() => (open.value = false)}>
            <Text fontWeight={600}>Done</Text>
          </Pressable>
        </HStack>
      </Sheet>
    </SafeArea>
  );
}
