import {
  Box,
  Button,
  SafeArea,
  Scroll,
  VStack,
  Text,
  onMount,
  signal,
  Show,
  audio,
  fileSystem,
  Video,
  videoRef,
  type VideoHandle,
  type VideoObjectFit,
} from 'kuito';

// Video end to end (docs/video.md): an HLS stream and a short MP4 on screen
// at once, the MP4 again from a downloaded file, the player's own controls,
// fullscreen, picture in picture, unmounting, a song from audio playing
// beside the videos, and playing on in the background under Audio's mode
// (picture in picture and background playback on iOS need
// `ios.backgroundModes: ['audio']`). Every event lands in the log.

const STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const CLIP =
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';
const MODES: VideoObjectFit[] = ['contain', 'cover', 'fill'];

/** The progress bar's width, in points. */
const BAR = 280;

const failed = (error: Error & { code?: string }) =>
  `${error.code ?? error.name}: ${error.message}`;

function Player(props: { name: string; uri: string; log: (line: string) => void }) {
  const { name, uri, log } = props;
  const player = videoRef();
  const paused = signal(true);
  const muted = signal(false);
  const loop = signal(false);
  const controls = signal(false);
  const rate = signal(1);
  const mode = signal(0);
  const time = signal('–');
  const attempt = (call: (handle: VideoHandle) => Promise<void>, what: string) => {
    const handle = player.current;

    if (handle)
      void call(handle).then(
        () => log(`${name} ${what} done`),
        (error: Error) => log(failed(error)),
      );
  };
  const event = (line: string) => log(`${name} ${line}`);

  return (
    <VStack gap={8}>
      <Video
        id={`${name}-video`}
        ref={player}
        src={{ uri }}
        paused={paused.value}
        muted={muted.value}
        loop={loop.value}
        rate={rate.value}
        controls={controls.value}
        objectFit={MODES[mode.value]}
        height={120}
        onLoad={(e) =>
          event(
            `load ${e.duration?.toFixed(1) ?? 'live'}s ${e.naturalSize.width}×${e.naturalSize.height}`,
          )
        }
        onProgress={(e) =>
          (time.value = `${e.currentTime.toFixed(1)}s, buffered ${e.playableDuration.toFixed(0)}s`)
        }
        onBuffer={(e) => event(e.isBuffering ? 'buffering' : 'buffered')}
        onPlaybackStateChange={(e) => event(e.isPlaying ? 'playing' : 'paused')}
        onEnd={() => event('end')}
        onError={(e) => event(`error ${e.code}: ${e.message}`)}
        onFullscreenChange={(e) => event(`fullscreen ${e.fullscreen}`)}
        onPictureInPictureChange={(e) => event(`picture in picture ${e.active}`)}
      />
      <Text id={`${name}-time`} color="#d0d0dc">
        {`${name}: ${player.playing.value ? 'playing' : 'paused'}${player.buffering.value ? ', buffering' : ''} · ${time.value}`}
      </Text>
      <Box width={BAR} height={4} backgroundColor="#2a2a36" overflow="hidden">
        {/* Bound to the ref's time on the UI thread. */}
        <Box
          width={BAR}
          height={4}
          backgroundColor="#f5c518"
          translateX={
            player.duration.value > 0 ? (player.time.value / player.duration.value - 1) * BAR : -BAR
          }
        />
      </Box>
      <VStack flexDirection="row" gap={8} flexWrap="wrap">
        <Button id={`${name}-paused`} onPress={() => (paused.value = !paused.value)}>
          paused prop
        </Button>
        <Button id={`${name}-play`} onPress={() => attempt((h) => h.play(), 'play')}>
          play()
        </Button>
        <Button id={`${name}-pause`} onPress={() => attempt((h) => h.pause(), 'pause')}>
          pause()
        </Button>
        <Button id={`${name}-seek`} onPress={() => attempt((h) => h.seek(5), 'seek')}>
          seek(5)
        </Button>
        <Button id={`${name}-mute`} onPress={() => (muted.value = !muted.value)}>
          Mute
        </Button>
        <Button id={`${name}-loop`} onPress={() => (loop.value = !loop.value)}>
          Loop
        </Button>
        <Button id={`${name}-rate`} onPress={() => (rate.value = rate.value === 1 ? 2 : 1)}>
          Rate
        </Button>
        <Button id={`${name}-mode`} onPress={() => (mode.value = (mode.value + 1) % 3)}>
          Resize
        </Button>
        <Button id={`${name}-controls`} onPress={() => (controls.value = !controls.value)}>
          Controls
        </Button>
        <Button
          id={`${name}-fullscreen`}
          onPress={() => attempt((h) => h.enterFullscreen(), 'fullscreen')}
        >
          Fullscreen
        </Button>
        <Button
          id={`${name}-pip`}
          onPress={() => attempt((h) => h.startPictureInPicture(), 'picture in picture')}
        >
          PiP
        </Button>
      </VStack>
    </VStack>
  );
}

export default function App() {
  const lines = signal<string[]>([]);
  const log = (line: string) => (lines.value = [line, ...lines.value].slice(0, 6));
  const shown = signal(true);
  const file = signal<string | null>(null);
  const song = audio.player(SONG, { volume: 0.4 });

  onMount(() => {
    void (async () => {
      const path = fileSystem.cache + 'clip.mp4';

      if (!(await fileSystem.exists(path))) await fileSystem.download(CLIP, path);

      file.value = path;
      log(`downloaded ${path}`);
    })().catch((error: Error) => log(failed(error)));
  });

  return (
    <SafeArea flex={1} backgroundColor="#101018">
      <Scroll>
        <VStack padding={16} gap={8}>
          <Text color="#ffffff" fontSize={22} fontWeight="bold">
            Video
          </Text>
          <VStack flexDirection="row" gap={8} flexWrap="wrap">
            <Button id="toggle" onPress={() => (shown.value = !shown.value)}>
              Mount / unmount
            </Button>
            <Button
              id="background"
              onPress={() =>
                void audio.configure({ staysActiveInBackground: true }).then(
                  () => log('the audio mode stays active in the background'),
                  (error: Error) => log(failed(error)),
                )
              }
            >
              Play in background
            </Button>
            <Button
              id="song"
              onPress={() =>
                void (song.playing.value ? song.pause() : song.play()).catch((error: Error) =>
                  log(failed(error)),
                )
              }
            >
              {song.playing.value ? 'Pause song' : 'Play song'}
            </Button>
          </VStack>
          <Text id="song-status" color="#d0d0dc">
            {`song: ${song.playing.value ? 'playing' : 'paused'}`}
          </Text>
          <VStack height={100} overflow="hidden">
            <Text id="log" color="#f5c518" fontSize={13}>
              {lines.value.join('\n')}
            </Text>
          </VStack>
          <Show when={shown.value}>
            <Player name="hls" uri={STREAM} log={log} />
            <Player name="mp4" uri={CLIP} log={log} />
            <Show when={file.value}>{(path) => <Player name="file" uri={path} log={log} />}</Show>
          </Show>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
