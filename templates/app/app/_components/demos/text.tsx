import { Image, Pressable, HStack, VStack, Text, signal } from 'kuito';
import { colors } from '../theme';

const MODES = ['cover', 'contain'] as const;

export function TextDemo() {
  const mode = signal<(typeof MODES)[number]>('cover');

  return (
    <VStack gap={12}>
      <Text fontSize={28} fontWeight={700} color={colors.text}>
        Large title
      </Text>
      <Text fontSize={17} color={colors.text}>
        Body text wraps to as many lines as it needs, measured natively.
      </Text>
      <Image
        src={{ uri: 'https://picsum.photos/id/1043/800/1000' }}
        height={180}
        borderRadius={12}
        backgroundColor={colors.accentSoft}
        objectFit={mode.value}
        fadeDuration={200}
      />
      <HStack gap={8}>
        {MODES.map((option) => (
          <Pressable
            key={option}
            flex={1}
            alignItems="center"
            padding={10}
            borderRadius={10}
            backgroundColor={mode.value === option ? colors.accent : colors.accentSoft}
            onPress={() => (mode.value = option)}
          >
            <Text color={mode.value === option ? '#ffffff' : colors.accent}>{option}</Text>
          </Pressable>
        ))}
      </HStack>
    </VStack>
  );
}
