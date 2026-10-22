import { Text, resource } from 'kuito';
import { assert, render, screen, test, type FetchAnswer } from 'kuito/tests';

function Weather() {
  const forecast = resource(async () => {
    const response = await fetch('https://api.example.com/forecast');

    return response.ok ? 'Sunny' : `Unavailable (${response.status})`;
  });

  return <Text>{forecast.data.value ?? 'Loading'}</Text>;
}

const outage: FetchAnswer = { status: 503, body: 'Service unavailable' };

test('an outage shows as unavailable', async () => {
  await render(<Weather />, { fetch: () => outage });

  assert.ok(screen.getByText('Unavailable (503)'));
});
