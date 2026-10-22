import { Button } from 'kuito';
import { assert, press, render, screen, test, type FetchRequest } from 'kuito/tests';

const Subscribe = () => (
  <Button
    onPress={() =>
      void fetch('https://api.example.com/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'yearly' }),
      })
    }
  >
    Subscribe
  </Button>
);

test('subscribing posts the plan', async () => {
  const sent: FetchRequest[] = [];

  await render(<Subscribe />, {
    fetch: (request) => {
      sent.push(request);

      return { status: 204 };
    },
  });
  await press(screen.getByText('Subscribe'));

  assert.equal(sent[0]?.method, 'POST');
  assert.deepEqual(JSON.parse(sent[0]?.body ?? ''), { plan: 'yearly' });
});
