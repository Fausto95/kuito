// Group related screen tests.
import { Text, Toggle, VStack, signal } from 'kuito';
import { assert, describe, press, render, screen, test } from 'kuito/tests';

function Settings() {
  const wifi = signal(true);

  return (
    <VStack>
      <Toggle label="Wi-Fi" checked={wifi} />
      <Text>{wifi.value ? 'Connected' : 'Off'}</Text>
    </VStack>
  );
}

describe('Settings', () => {
  test('starts connected', async () => {
    await render(<Settings />);

    assert.ok(screen.getByText('Connected'));
  });

  test('the toggle turns Wi-Fi off', async () => {
    await render(<Settings />);

    await press(screen.getByRole('switch', { name: 'Wi-Fi' }));

    assert.ok(screen.getByText('Off'));
  });
});
