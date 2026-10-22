// Formats an app writes itself (../formats.ts), typed into the fields that use them.
import { assert, render, screen, test, type, type TestView } from 'kuito/tests';
import { GiftCard, Payment, Selected } from '../payment';

const field = (name: string) => screen.getByRole('textbox', { name });

/** The text and caret a field shows, the caret written as `|`. */
function shown(view: TestView): string {
  const text = typeof view.props.text === 'string' ? view.props.text : '';
  const { start } = view.props.selection as { start: number };

  return text.slice(0, start) + '|' + text.slice(start);
}

test('a card number groups its digits as they are typed, on the UI thread', async () => {
  const app = await render(<Payment />);
  const card = field('Card number');
  const rendered = app.mutations.length;

  await type(card, '42424242424242424');

  assert.equal(shown(card), '4242 4242 4242 4242 4|');
  assert.ok(screen.getByText('Card: 4242 4242 4242 4242 4'));

  // The UI thread wrote the field's text; the JS thread, which only heard of it, sent none.
  assert.equal(
    app.mutations
      .slice(rendered)
      .filter((m) => m.op === 'prop' && m.id === card.id && m.name === 'text').length,
    0,
  );
});

test('a field placed whole formats, writes its signal and shows it, with no JS-thread batch', async () => {
  const app = await render(<Payment />);
  const before = app.mutations.length;

  await type(field('Expiry'), '1229');

  assert.equal(shown(field('Expiry')), '12/29|');
  assert.ok(screen.getByText('Expires 12/29'));
  assert.equal(app.mutations.length, before);
});

test('an amount regroups its thousands; letters typed into it are dropped', async () => {
  await render(<Payment />);

  await type(field('Amount'), '1234567.891x');

  assert.equal(shown(field('Amount')), '$1,234,567.89|');
  assert.ok(screen.getByText('Amount: $1,234,567.89'));
});

test('a format the JS thread runs shows its text and reaches an onChange on the UI thread', async () => {
  await render(<GiftCard />);

  await type(field('Gift card'), '42424');

  assert.equal(shown(field('Gift card')), '4242 4|');
  assert.ok(screen.getByText('Gift card 4242 4'));
});

test('the caret a format moves is reported as the user’s selection', async () => {
  await render(<Selected />);

  await type(field('Card number'), '42424');

  assert.ok(screen.getByText('Caret at 6'));
});
