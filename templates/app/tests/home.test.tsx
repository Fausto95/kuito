// A test of the Home screen on the headless host: `npm test` runs it, with
// real layout and no simulator (Kuito's docs/testing.md).
import { assert, press, render, screen, test, within } from 'kuito/tests';
import Home from '../app/(home)/index';

test('Add one counts the presses, and Reset clears them', async () => {
  await render(<Home />);

  await press(screen.getByText('Add one'));
  await press(screen.getByText('Add one'));
  assert.ok(screen.getByText('2'));
  assert.ok(screen.getByText('presses so far'));

  await press(screen.getByText('Reset'));
  assert.ok(screen.getByText('0'));
});

test('the two buttons share the card’s last row', async () => {
  await render(<Home />);

  const card = screen.getByText('STATE AND MOTION').parent;
  const [add, reset] = ['Add one', 'Reset'].map((text) => screen.getByText(text).parent?.frame);

  assert.ok(card && within(card).getByText('Add one'));
  assert.equal(add?.width, reset?.width);
  assert.equal(add?.y, reset?.y);
});
