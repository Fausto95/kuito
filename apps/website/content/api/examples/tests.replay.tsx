// Compare a recorded native batch stream with its saved tree.
import { assert, replay, test } from 'kuito/tests';

test('recorded checkout keeps its native tree', async () => {
  // Supply a .krec recording and its adjacent .tree file from your app.
  const result = await replay('tests/fixtures/checkout.krec');
  assert.notEqual(result.recorded, null);
  assert.equal(result.tree, result.recorded);
});
