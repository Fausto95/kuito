// Limit the work an interaction performs.
import { Button, Text, VStack, signal } from 'kuito';
import { costOf, press, render, screen, test, type CostBudget } from 'kuito/tests';

function Like() {
  const liked = signal(false);

  return (
    <VStack>
      <Text color={liked.value ? '#ff3b30' : '#8e8e93'}>♥</Text>
      <Button onPress={() => (liked.value = !liked.value)}>Like</Button>
    </VStack>
  );
}

// A color change repaints one view: no layout, no new views.
const repaintOnly: CostBudget = { layoutPasses: 0, viewsCreated: 0, propWrites: 1 };

test('a like only repaints the heart', async () => {
  await render(<Like />);

  (await costOf(() => press(screen.getByText('Like')))).toStayWithin(repaintOnly);
});
