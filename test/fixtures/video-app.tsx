import { VStack, ref, signal, Show, Video, videoRef, type VideoHandle } from 'kuito';

const MOVIE = 'https://example.com/movie.m3u8';

export default function App() {
  const shown = signal(true);
  const paused = signal(true);
  const events = signal<unknown[]>([]);
  const player = ref<VideoHandle>();
  const clip = videoRef();
  const ends: number[] = [];

  clip.watch('ended', () => ends.push(ends.length + 1));

  const seen = (event: { type: string }) => {
    const {
      type,
      target: _target,
      currentTarget: _current,
      isTrusted: _trusted,
      ...payload
    } = event as Record<string, unknown>;

    events.value = [...events.value, [type, payload]];
  };

  // The test drives the views as an app would, from inside the kernel.
  Object.assign(globalThis, {
    player,
    clip,
    ends,
    events,
    showPlayers: (next: boolean) => (shown.value = next),
    setPaused: (next: boolean) => (paused.value = next),
  });

  return (
    <VStack id="root">
      <Show when={shown.value}>
        <Video
          id="movie"
          ref={player}
          src={{ uri: MOVIE }}
          paused={paused.value}
          muted
          volume={0.5}
          rate={1.5}
          loop
          objectFit="cover"
          controls
          progressInterval={500}
          height={220}
          onLoad={seen}
          onProgress={seen}
          onBuffer={seen}
          onEnd={seen}
          onError={seen}
          onPlaybackStateChange={seen}
          onFullscreenChange={seen}
          onPictureInPictureChange={seen}
        />
        <Video id="clip" ref={clip} src={{ uri: 'file:///data/Caches/clip.mp4' }} height={120} />
      </Show>
    </VStack>
  );
}
