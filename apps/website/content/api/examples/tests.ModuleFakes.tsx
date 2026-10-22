// Provide several native capabilities in a test.
import { Text, appearance, network } from 'kuito';
import { assert, render, screen, test, type ModuleFakes } from 'kuito/tests';

const Status = () => (
  <Text>{`${appearance.colorScheme.value} · ${network.state.value.isConnected ? 'online' : 'offline'}`}</Text>
);

// A dark, offline device: one fake per module, live values as their value.
const offlineAtNight: ModuleFakes = {
  Appearance: { colorScheme: 'dark', fontScale: 1 },
  Network: {
    state: { type: 'none', isConnected: false, isInternetReachable: false, details: null },
  },
};

test('the status bar reads dark and offline', async () => {
  await render(<Status />, { modules: offlineAtNight });

  assert.ok(screen.getByText('dark · offline'));
});
