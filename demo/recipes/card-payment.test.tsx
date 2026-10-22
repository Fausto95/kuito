// The card payment recipe on the headless host: the number groups as it is
// typed, a complete one plays the haptic its checksum calls for, and a paste
// lands formatted at the caret.
import { assert, press, render, screen, test, type } from 'kuito/tests';
import CardPayment from './card-payment';

const field = (name: string) => screen.getByRole('textbox', { name });

const modules = { Clipboard: { readText: () => '4242-4242-4242-4242' } };

test('the card number shows in groups of four as it is typed', async () => {
  await render(<CardPayment />, { modules });
  await type(field('Card number'), '42424242');

  assert.equal(field('Card number').props.text, '4242 4242');
});

test('the expiry gets its slash once the month is typed', async () => {
  await render(<CardPayment />, { modules });
  await type(field('Expiry'), '0429');

  assert.equal(field('Expiry').props.text, '04/29');
});

type Calls = { calls: readonly { module: string; args: unknown[] }[] };

/** The haptics `typing` plays: calls are the file's, so count from before it. */
async function hapticsOf(app: Calls, typing: () => Promise<unknown>) {
  const before = app.calls.length;

  await typing();

  return app.calls
    .slice(before)
    .filter((call) => call.module === 'Haptics')
    .map((call) => call.args[0]);
}

test('a complete number says so and plays success', async () => {
  const app = await render(<CardPayment />, { modules });

  const played = await hapticsOf(app, () => type(field('Card number'), '4242424242424242'));

  assert.ok(screen.getByText('Card number complete'));
  assert.deepEqual(played, ['success']);
});

test('a mistyped number fails its checksum and plays an error', async () => {
  const app = await render(<CardPayment />, { modules });

  const played = await hapticsOf(app, () => type(field('Card number'), '4242424242424241'));

  assert.ok(screen.getByText('Check the card number'));
  assert.deepEqual(played, ['error']);
});

test('a paste is formatted and leaves the caret after it', async () => {
  await render(<CardPayment />, { modules });
  await press(screen.getByRole('button', { name: 'Paste' }));

  assert.equal(field('Card number').props.text, '4242 4242 4242 4242');
  assert.deepEqual(field('Card number').props.selection, { start: 19, end: 19 });
  assert.ok(screen.getByText('Card number complete'));
});
