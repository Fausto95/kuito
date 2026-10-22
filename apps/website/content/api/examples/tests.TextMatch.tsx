// Find text with a string or pattern.
import { Text } from 'kuito';
import { assert, render, screen, test, type TextMatch } from 'kuito/tests';

// A string matches the whole text; a RegExp tests it.
const itemsLeft: TextMatch = /^\d+ items? left$/;

test('the footer counts what is left', async () => {
  await render(<Text>3 items left</Text>);

  assert.ok(screen.getByText(itemsLeft));
  assert.equal(screen.queryByText('3 items'), null);
});
