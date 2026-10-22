import { List, SafeArea, VStack, Text } from 'kuito';

/**
 * The host-boundary benchmark (benchmarks/README.md): a List of 1,000
 * rows on its first render. The native list asks for the rows it shows;
 * scripts/benchmark-commits.ts reads what each commit cost.
 */
interface Item {
  id: string;
  number: number;
}

const ITEMS: Item[] = Array.from({ length: 1000 }, (_, number) => ({
  id: 'row-' + number,
  number,
}));

function RowView(props: { item: Item }) {
  const number = props.item.number;

  return (
    <VStack padding={12} gap={4} backgroundColor={number % 2 === 0 ? '#ffffff' : '#f2f2f7'}>
      <Text fontSize={16} fontWeight="bold" color="#111111">
        {'HStack ' + (number + 1)}
      </Text>
      <Text fontSize={13} color="#6e6e73">
        {'Item ' + props.item.id}
      </Text>
    </VStack>
  );
}

export default function FirstRender() {
  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <List flex={1} data={ITEMS} renderItem={({ item }) => <RowView item={item} />} />
    </SafeArea>
  );
}
