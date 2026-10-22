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
  type AudioPlayer,
} from 'kuito';

// Audio end to end (docs/audio.md): two remote MP3s that play at once, one
// downloaded and played from its file URI, seeking and looping, and a
// recording played back. Each player belongs to the Track that makes it.
// Progress bars move on the UI thread, with no JS work while playing.
// Interruptions (a call, Siri, another app taking focus) show in the log.
// "Background" keeps playback going with the app in the background; on iOS
// it needs ios.backgroundModes: ['audio'].

const SONG = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const OTHER = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3';

/** The progress bar's width, in points. */
const BAR = 280;

const failed = (error: Error & { code?: string }) =>
  `${error.code ?? error.name}: ${error.message}`;

/** A bar that fills as `player.time` moves: bound on the UI thread. */
function Progress(props: { player: AudioPlayer }) {
  const { time, duration } = props.player;

  return (
    <Box width={BAR} height={4} borderRadius={2} backgroundColor="#2a2a36" overflow="hidden">
      <Box
        width={BAR}
        height={4}
        backgroundColor="#f5c518"
        translateX={duration.value > 0 ? (time.value / duration.value - 1) * BAR : -BAR}
      />
    </Box>
  );
}

function Track(props: { name: string; src: string; volume?: number; log: (line: string) => void }) {
  const { name, log } = props;
  const player = audio.player(props.src, { volume: props.volume ?? 1 });
  const attempt = (work: Promise<void>) => work.catch((error: Error) => log(failed(error)));

  player.watch('ended', () => log(`${name} ended`));

  return (
    <VStack gap={8}>
      <Text id={`${name}-status`} color="#d0d0dc">
        {[
          name,
          player.error.value ?? (player.loaded.value ? 'loaded' : 'loading'),
          player.playing.value ? 'playing' : 'paused',
          player.buffering.value ? 'buffering' : '',
          player.loop.value ? 'loop' : '',
          `rate ${player.rate.value}`,
          `volume ${player.volume.value}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Progress player={player} />
      <VStack flexDirection="row" gap={8} flexWrap="wrap">
        <Button id={`${name}-play`} onPress={() => (player.playing.value = !player.playing.value)}>
          {player.playing.value ? 'Pause' : 'Play'}
        </Button>
        <Button
          id={`${name}-end`}
          onPress={() => void attempt(player.seek(Math.max(0, player.duration.value - 5)))}
        >
          −5s from end
        </Button>
        <Button id={`${name}-loop`} onPress={() => (player.loop.value = !player.loop.value)}>
          Loop
        </Button>
        <Button
          id={`${name}-rate`}
          onPress={() => (player.rate.value = player.rate.value === 1 ? 1.5 : 1)}
        >
          Rate
        </Button>
        <Button
          id={`${name}-volume`}
          onPress={() => (player.volume.value = player.volume.value === 1 ? 0.3 : 1)}
        >
          Volume
        </Button>
      </VStack>
    </VStack>
  );
}

function Recorder(props: { log: (line: string) => void; played: (uri: string) => void }) {
  const { log } = props;
  const recorder = audio.recorder({ metering: true });
  const attempt = (work: Promise<void>) => work.catch((error: Error) => log(failed(error)));

  const stop = async () => {
    const { uri, duration } = await recorder.stop();

    log(`recorded ${duration.toFixed(1)}s to ${uri}`);
    props.played(uri);
  };

  return (
    <VStack gap={8}>
      <Text id="recorder-status" color="#d0d0dc">
        {recorder.recording.value ? 'recording' : 'idle'}
      </Text>
      <Box
        width={BAR}
        height={4}
        backgroundColor="#e5484d"
        opacity={Math.max(0.1, 1 + recorder.level.value / 60)}
      />
      <VStack flexDirection="row" gap={8} flexWrap="wrap">
        <Button id="record" onPress={() => void attempt(recorder.start())}>
          Record
        </Button>
        <Button id="record-pause" onPress={() => void attempt(recorder.pause())}>
          Pause
        </Button>
        <Button id="record-stop" onPress={() => void attempt(stop())}>
          Stop and play
        </Button>
      </VStack>
    </VStack>
  );
}

export default function App() {
  const lines = signal<string[]>([]);
  const log = (line: string) => (lines.value = [line, ...lines.value].slice(0, 8));
  const local = signal<string | null>(null);
  const take = signal<string | null>(null);
  const background = signal(false);

  audio.watch('interruption', ({ type, shouldResume }) =>
    log(`interruption ${type}${shouldResume ? ', should resume' : ''}`),
  );

  const toggleBackground = async () => {
    await audio.configure({ staysActiveInBackground: !background.value });
    background.value = !background.value;
    log(`background playback ${background.value ? 'on' : 'off'}`);
  };

  onMount(() => {
    void (async () => {
      await audio.configure({ allowsRecording: true });

      const file = fileSystem.cache + 'song-2.mp3';

      if (!(await fileSystem.exists(file)))
        await fileSystem.download(
          'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
          file,
        );

      local.value = file;
      log(`downloaded ${file}`);
    })().catch((error: Error) => log(failed(error)));
  });

  return (
    <SafeArea flex={1} backgroundColor="#101018">
      <Scroll>
        <VStack padding={24} gap={16}>
          <Text color="#ffffff" fontSize={22} fontWeight="bold">
            Audio
          </Text>
          <Text color="#ffffff" fontSize={18} fontWeight="bold">
            Log
          </Text>
          <Text id="log" color="#f5c518">
            {lines.value.join('\n')}
          </Text>
          <Button
            id="background"
            onPress={() => void toggleBackground().catch((error: Error) => log(failed(error)))}
          >
            {background.value ? 'Background: on' : 'Background: off'}
          </Button>
          <Text color="#ffffff" fontSize={18} fontWeight="bold">
            Recorder
          </Text>
          <Recorder log={log} played={(uri) => (take.value = uri)} />
          <Show when={take.value}>{(uri) => <Track name="take" src={uri} log={log} />}</Show>
          <Track name="song" src={SONG} log={log} />
          <Track name="other" src={OTHER} volume={0.6} log={log} />
          <Show when={local.value}>{(uri) => <Track name="local" src={uri} log={log} />}</Show>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
