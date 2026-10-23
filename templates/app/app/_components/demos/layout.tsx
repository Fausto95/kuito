import { Box, Pressable, HStack, VStack, Text, signal } from 'kuito';
import { colors } from '../theme';

const JUSTIFY = ['flex-start', 'center', 'space-between', 'space-evenly'] as const;

export function LayoutDemo() {
  const step = signal(0);
  // Called in JSX, so the props follow the signal: a component body runs once.
  const justify = () => JUSTIFY[step.value % JUSTIFY.length];

  return (
    <VStack gap={12}>
      <HStack
        height={72}
        padding={8}
        gap={8}
        borderRadius={12}
        backgroundColor={colors.accentSoft}
        // An HStack centers its children across it; the swatches fill its height.
        alignItems="stretch"
        justifyContent={justify()}
      >
        <Box width={56} borderRadius={8} backgroundColor={colors.accent} />
        <Box width={56} borderRadius={8} backgroundColor="#bf5af2" />
        <Box width={56} borderRadius={8} backgroundColor="#ff9f0a" />
      </HStack>
      <Pressable
        alignItems="center"
        padding={12}
        borderRadius={12}
        backgroundColor={colors.accent}
        pressedScale={0.97}
        onPress={() => step.value++}
      >
        <Text fontSize={16} fontWeight={600} color="#ffffff">
          {`justifyContent: ${justify()}`}
        </Text>
      </Pressable>
    </VStack>
  );
}
