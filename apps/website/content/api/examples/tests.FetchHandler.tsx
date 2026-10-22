import { Text, resource } from 'kuito';
import { assert, render, screen, test, type FetchHandler } from 'kuito/tests';

// A tiny fake server: answers by path, 404 for the rest.
const api: FetchHandler = (request) => {
  const path = new URL(request.url).pathname;

  if (path === '/me')
    return { headers: { 'Content-Type': 'application/json' }, body: '{"name":"Ana"}' };

  return { status: 404 };
};

function Greeting() {
  const me = resource(async () => {
    const response = await fetch('https://api.example.com/me');

    return ((await response.json()) as { name: string }).name;
  });

  return <Text>{`Hi, ${me.data.value ?? '…'}`}</Text>;
}

test('greets the signed-in user', async () => {
  await render(<Greeting />, { fetch: api });

  assert.ok(screen.getByText('Hi, Ana'));
});
