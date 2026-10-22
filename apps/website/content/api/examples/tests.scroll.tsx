import { List, Text } from 'kuito';
import { assert, render, screen, scroll, test } from 'kuito/tests';

const rows = Array.from({ length: 200 }, (_, index) => `Row ${index}`);

const Long = () => <List data={rows} renderItem={({ item }) => <Text height={44}>{item}</Text>} />;

test('rows far down bind once the list scrolls to them', async () => {
  await render(<Long />);

  assert.equal(screen.queryByText('Row 150'), null);

  await scroll(screen.getByText('Row 0'), { y: 150 * 44 });

  assert.ok(screen.getByText('Row 150'));
});
