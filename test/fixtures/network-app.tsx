import { VStack, Text, signal, Show, network } from 'kuito';

function Status() {
  return (
    <Text id="status">
      {`${network.state.value.type} ${network.state.value.isInternetReachable ? 'online' : 'offline'}`}
    </Text>
  );
}

export default function App() {
  const shown = signal(false);

  // The test drives the API and mounts Status as an app would, from inside the kernel.
  Object.assign(globalThis, { network, showStatus: (next: boolean) => (shown.value = next) });

  return (
    <VStack id="root">
      <Show when={shown.value}>
        <Status />
      </Show>
    </VStack>
  );
}
