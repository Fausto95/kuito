// Assert a view's bounds.
import { SafeArea, Text } from 'kuito';
import { assert, render, screen, test, type Edges } from 'kuito/tests';

// A phone with a notch in landscape: the sides are covered, not the top.
const landscapeInsets: Edges = { top: 0, right: 62, bottom: 21, left: 62 };

test('content clears the notch in landscape', async () => {
  await render(
    <SafeArea>
      <Text>Now playing</Text>
    </SafeArea>,
    { screen: { width: 874, height: 402, scale: 3, insets: landscapeInsets } },
  );

  assert.ok(screen.getByText('Now playing').windowFrame.x >= landscapeInsets.left);
});
