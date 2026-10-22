// Run by test/headless.test.ts: failures name the test file's line.
import { assert, render, screen, test } from 'kuito/tests';
import { Text } from 'kuito';

test('a missing text fails with the tree', async () => {
  await render(<Text>Here</Text>);

  assert.ok(screen.getByText('Elsewhere'));
});

test('an assertion names the test file’s line', async () => {
  await render(<Text>Here</Text>);

  assert.equal(screen.getByText('Here').text, 'There');
});
