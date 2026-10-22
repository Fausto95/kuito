import { Box, For, Pressable, Text, VStack, fade, signal, spring, timing } from 'kuito';

const START = Array.from({ length: 100 }, (_, index) => ({
  id: 'item-' + index,
  title: 'Item ' + index,
}));

export default function App() {
  const items = signal(START);
  const added = signal(0);

  return [
    <Pressable
      id="update"
      label="update"
      onPress={() => {
        const [first, ...rest] = items.value;

        added.value++;

        // A move, an insert and an edit, as one press does to a feed.
        items.value = [
          ...rest.slice(0, 50),
          { id: 'new-' + added.value, title: 'New ' + added.value },
          ...rest
            .slice(50)
            .map((item, index) => (index === 0 ? { ...item, title: item.title + '!' } : item)),
          first,
        ];
      }}
    />,
    <VStack id="items">
      <For each={items.value}>
        {(item) => (
          <Box
            layout={spring()}
            enter={fade}
            transition={{ opacity: timing(180) }}
            backgroundGradient={{ angle: 90, colors: ['#ffffff', '#eeeeee'] }}
          >
            <Text>{item.title}</Text>
          </Box>
        )}
      </For>
    </VStack>,
  ];
}
