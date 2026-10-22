import {
  Box,
  Button,
  List,
  HStack,
  Pressable,
  SafeArea,
  VStack,
  Text,
  ref,
  signal,
  store,
  type ListHandle,
} from 'kuito';

/**
 * List under load: 10,000 rows of mixed heights, virtualized by the
 * platform, over a store, in sections of 100 whose headers stick. Tapping
 * a row likes it: one prop write on its cell. Jump scrolls to a row nobody has measured; Insert adds a row at the
 * top, which the native list animates in. Benchmark scrolls 1,500 rows at a
 * fling's speed, for frame stats.
 */
interface Item {
  id: string;
  number: number;
  liked: boolean;
}

const HUES = ['#ff5a5f', '#ffb400', '#00a699', '#007aff', '#8e44ad', '#2ecc71', '#e67e22'];
const WORDS =
  'Rows are rendered when the native list asks for them and re-bound when it recycles a cell, ' +
  'so scrolling never waits for JavaScript. A row that is not rendered yet keeps its estimated ' +
  'height until it arrives, and every row lays out on its own with the shared flexbox engine.';

const ITEMS: Item[] = Array.from({ length: 10000 }, (_, number) => ({
  id: 'row-' + number,
  number,
  liked: false,
}));

/** Varied but stable per row: one to four lines of text, and a block every seventh row. */
function RowView(props: { item: Item }) {
  const number = props.item.number;
  // Inserted rows count down from -1.
  const n = Math.abs(number);
  const hue = HUES[n % HUES.length];

  return (
    <Pressable
      padding={12}
      gap={8}
      backgroundColor={n % 2 === 0 ? '#ffffff' : '#f7f7f9'}
      onPress={() => (props.item.liked = !props.item.liked)}
    >
      <HStack gap={12}>
        <Box width={36} height={36} flexShrink={0} borderRadius={18} backgroundColor={hue} />
        <VStack flexShrink={1} gap={2}>
          <Text fontSize={16} fontWeight="bold">
            {(number < 0 ? 'New row ' + n : 'Row ' + (number + 1)) + (props.item.liked ? ' ♥' : '')}
          </Text>
          <Text fontSize={13} color="#666670">
            {WORDS.slice(0, 50 + ((n * 37) % 4) * 60)}
          </Text>
        </VStack>
      </HStack>
      {n % 7 === 0 ? (
        <Box height={60 + (n % 5) * 30} borderRadius={12} backgroundColor={hue} opacity={0.35} />
      ) : null}
    </Pressable>
  );
}

export default function App() {
  const shelf = store({ items: ITEMS });
  const inserted = signal(0);
  const list = ref<ListHandle>();
  const visible = signal('');

  /** A fast scroll through 1,500 rows, the same on every device: for frame stats. */
  function benchmark(index = 0) {
    list.current?.scrollToIndex({ index });

    if (index < 1500) setTimeout(() => benchmark(index + 15), 250);
  }

  function insert() {
    inserted.value++;
    shelf.items.unshift({ id: 'new-' + inserted.value, number: -inserted.value, liked: false });
  }

  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <VStack padding={12} gap={2}>
        <Text fontSize={20} fontWeight="bold">
          {shelf.items.length + ' rows'}
        </Text>
        <Text fontSize={13} color="#666670">
          {visible.value}
        </Text>
      </VStack>
      <List
        id="rows"
        ref={list}
        data={shelf.items}
        renderItem={({ item }) => <RowView item={item} />}
        sectionKey={(item) => (item.number < 0 ? 'New' : String(Math.floor(item.number / 100)))}
        renderSection={({ section }) => (
          <VStack padding={8} backgroundColor="#e4e4ea">
            <Text fontSize={13} fontWeight="bold" color="#444450">
              {section === 'New'
                ? 'New rows'
                : 'Rows ' + (Number(section) * 100 + 1) + '–' + (Number(section) * 100 + 100)}
            </Text>
          </VStack>
        )}
        stickySections
        separator={() => <Box height={1} backgroundColor="#e4e4ea" />}
        onViewableChange={({ viewableItems }) => {
          const first = viewableItems[0];
          const last = viewableItems[viewableItems.length - 1];

          visible.value = first && last ? 'Showing ' + first.key + ' to ' + last.key : '';
        }}
      />
      <HStack padding={12} gap={16} justifyContent="center">
        <Button id="top" onPress={() => list.current?.scrollToIndex({ index: 0 })}>
          Top
        </Button>
        <Button id="jump" onPress={() => list.current?.scrollToIndex({ index: 5000, align: 0.5 })}>
          Jump to 5000
        </Button>
        <Button id="insert" onPress={insert}>
          Insert
        </Button>
        <Button id="benchmark" onPress={() => benchmark()}>
          Benchmark
        </Button>
      </HStack>
    </SafeArea>
  );
}
