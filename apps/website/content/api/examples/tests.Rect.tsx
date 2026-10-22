import { HStack, Text } from 'kuito';
import { assert, render, screen, test, type Rect } from 'kuito/tests';

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('a long title never runs under the badge', async () => {
  await render(
    <HStack width={200}>
      <Text flexShrink={1}>A very long episode title that wraps</Text>
      <Text>NEW</Text>
    </HStack>,
  );

  const title = screen.getByText('A very long episode title that wraps').windowFrame;
  const badge = screen.getByText('NEW').windowFrame;

  assert.ok(!overlaps(title, badge));
});
