import { VStack, Text, signal, Show, app, audio } from 'kuito';

function Track() {
  const song = audio.player('https://example.com/song.mp3', { loop: true });

  Object.assign(globalThis, { track: song });

  return (
    <Text id="track">
      {`${song.playing.value ? 'playing' : 'paused'} ${song.loaded.value ? 'loaded' : 'loading'}`}
    </Text>
  );
}

export default function App() {
  const shown = signal(false);

  // The test drives the API and mounts Track as an app would, from inside the kernel.
  Object.assign(globalThis, { app, audio, showTrack: (next: boolean) => (shown.value = next) });

  return (
    <VStack id="root">
      <Show when={shown.value}>
        <Track />
      </Show>
    </VStack>
  );
}
