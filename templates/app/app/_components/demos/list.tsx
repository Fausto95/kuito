import { Box, List, Pressable, HStack, VStack, Text, ref, signal, type ListHandle } from 'kuito';
import { colors } from '../theme';

const HUES = ['#5e5ce6', '#bf5af2', '#ff9f0a', '#30d158', '#0a84ff'];
const ROWS = Array.from({ length: 1000 }, (_, index) => index + 1);

export function ListDemo() {
  const rows = signal(ROWS);
  const list = ref<ListHandle>();

  const insert = () => {
    rows.value = [rows.value.length + 1, ...rows.value];
    // The native list keeps the rows on screen where they are; bring the new one into view.
    list.current?.scrollToIndex({ index: 0 });
  };

  return (
    <VStack flex={1} gap={12}>
      <Pressable
        alignItems="center"
        padding={12}
        borderRadius={12}
        backgroundColor={colors.accent}
        pressedScale={0.97}
        onPress={insert}
      >
        <Text fontSize={16} fontWeight={600} color="#ffffff">
          {`Insert a row (${rows.value.length})`}
        </Text>
      </Pressable>
      <List
        ref={list}
        flex={1}
        gap={8}
        data={rows.value}
        itemKey={(row) => String(row)}
        renderItem={({ item }) => (
          <HStack
            alignItems="center"
            gap={12}
            padding={12}
            borderRadius={12}
            backgroundColor={colors.card}
          >
            <Box
              width={12}
              height={12}
              borderRadius={6}
              backgroundColor={HUES[item % HUES.length]}
            />
            <Text fontSize={16} color={colors.text}>{`HStack ${item}`}</Text>
          </HStack>
        )}
      />
    </VStack>
  );
}
