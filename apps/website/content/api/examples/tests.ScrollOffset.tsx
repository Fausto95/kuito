// Set a test scroll position.
import { Scroll, Text, signal } from 'kuito';
import { assert, render, scroll, screen, test, type ScrollOffset } from 'kuito/tests';

function Terms() {
  const read = signal(false);

  return (
    <Scroll onReachEnd={() => (read.value = true)}>
      <Text height={3000}>Terms of service…</Text>
      <Text>{read.value ? 'Thanks for reading' : 'Keep scrolling'}</Text>
    </Scroll>
  );
}

const bottom: ScrollOffset = { y: 3000 };

test('reaching the end of the terms thanks the reader', async () => {
  await render(<Terms />);

  await scroll(screen.getByText('Terms of service…'), bottom);

  assert.ok(screen.getByText('Thanks for reading'));
});
