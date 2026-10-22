// The card stack on the headless host: Keep and Pass throw the top card,
// and its menu shares it. The headless host sends no pan or fling, so the
// drag and the flick are left to a device.
import { advance, assert, choose, press, render, screen, test } from 'kuito/tests';
import CardStack from './card-stack';

// Long enough for a thrown card's spring to land off screen.
const FLIGHT = 1000;

const scaleOf = (title: string) => Number(screen.getByText(title).parent?.props.scale);

test('Keep throws the top card and counts it', async () => {
  await render(<CardStack />);

  await press(screen.getByText('Keep'));
  await advance(FLIGHT);

  assert.equal(screen.queryByText('Severance'), null);
  assert.ok(screen.getByText('1 kept of 1 seen'));
  assert.ok(screen.getByText('Slow Horses'), 'a new card waits behind');
});

test('the next card springs forward, past its size and back', async () => {
  await render(<CardStack />);

  assert.equal(scaleOf('The Bear'), 0.94, 'it waits smaller');

  await press(screen.getByText('Keep'));
  await advance(FLIGHT);

  let largest = scaleOf('The Bear');

  for (let frame = 0; frame < 120; frame++) {
    await advance(16);
    largest = Math.max(largest, scaleOf('The Bear'));
  }

  assert.ok(largest > 1, `it overshoots (to ${largest})`);
  assert.ok(Math.abs(scaleOf('The Bear') - 1) < 0.001, 'and settles at its size');
});

test('Pass from the menu throws the card the other way', async () => {
  await render(<CardStack />);

  await choose(screen.getByText('Severance'), 'Pass');

  const thrown = screen.getByText('Severance').parent;

  await advance(FLIGHT / 10);
  assert.ok(Number(thrown?.props.translateX) < 0, 'it leaves to the left');

  await advance(FLIGHT);
  assert.ok(screen.getByText('0 kept of 1 seen'));
});

test('Share hands the pick to the share sheet', async () => {
  const app = await render(<CardStack />, {
    modules: { Share: { share: async () => ({ action: 'shared' }) } },
  });

  await choose(screen.getByText('Severance'), 'Share');

  assert.deepEqual(
    app.calls.filter((call) => call.module === 'Share'),
    [
      {
        module: 'Share',
        name: 'share',
        args: [{ message: 'Watch Severance tonight', url: 'https://kuito.dev/picks/1' }],
      },
    ],
  );
});

test('after the last card, the stack starts over', async () => {
  await render(<CardStack />);

  for (const title of ['Severance', 'The Bear', 'Slow Horses', 'Shrinking']) {
    await choose(screen.getByText(title), 'Keep');
    await advance(FLIGHT);
  }

  assert.ok(screen.getByText('4 kept of 4 seen'));
  await press(screen.getByText('That’s every pick: start over'));

  assert.ok(screen.getByText('Severance'));
  assert.ok(screen.getByText('0 kept of 0 seen'));
});
