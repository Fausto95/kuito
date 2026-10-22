import { VStack, Text, type KuitoNode } from 'kuito';
import { colors } from './theme';

export function Card({ title, children }: { title: string; children?: KuitoNode }) {
  return (
    <VStack backgroundColor={colors.card} borderRadius={16} padding={16} gap={12}>
      <Text fontSize={13} fontWeight={600} color={colors.muted}>
        {title.toUpperCase()}
      </Text>
      {children}
    </VStack>
  );
}
