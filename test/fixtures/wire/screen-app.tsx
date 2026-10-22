import { Box, For, HStack, Text, VStack, styles } from 'kuito';

// A 501-view screen: a column of 50 cards, each a row of eight boxes and a
// label, laid out by sizes, a percentage, alignments and a direction.
const sheet = styles({
  screen: { padding: '16px', gap: '8px', justifyContent: 'flex-start' },
  card: {
    width: '100%',
    height: '48px',
    gap: '4px',
    alignItems: 'center',
    flexDirection: 'row',
  },
  box: { width: '20px', height: '20px', flexShrink: 0 },
  label: { flexGrow: 1, alignSelf: 'center' },
});

const CARDS = Array.from({ length: 50 }, (_, index) => 'Card ' + index);

export default function App() {
  return (
    <VStack class={sheet.screen}>
      <For each={CARDS}>
        {(title) => (
          <HStack class={sheet.card}>
            <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>{() => <Box class={sheet.box} />}</For>
            <Text class={sheet.label}>{title}</Text>
          </HStack>
        )}
      </For>
    </VStack>
  );
}
