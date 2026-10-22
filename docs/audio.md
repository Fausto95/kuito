# Play and record audio

Use a native audio player for music, podcasts or sound clips, and a recorder for voice notes. Playback and recording expose reactive state and native motion clocks.

## Play a track and record a voice note

```tsx
import { Box, Button, VStack, Text, audio, onMount } from 'kuito';

function Track() {
  // The component owns it: made when it mounts, released when it unmounts.
  const song = audio.player('https://example.com/song.mp3', { loop: true });
  const { time, duration } = song;

  return (
    <VStack>
      {/* A 280-point bar that fills from the left, moved on the UI thread. */}
      <Box width={280} height={4} overflow="hidden">
        <Box
          width={280}
          height={4}
          backgroundColor="#e50914"
          translateX={duration.value > 0 ? (time.value / duration.value - 1) * 280 : -280}
        />
      </Box>
      <Button onPress={() => (song.playing.value = !song.playing.value)}>
        {song.playing.value ? 'Pause' : 'Play'}
      </Button>
      <Button onPress={() => void song.seek(time.value + 30)}>Skip</Button>
    </VStack>
  );
}

function Memo() {
  const recorder = audio.recorder({ quality: 'medium', metering: true });

  onMount(() => void audio.configure({ allowsRecording: true }));

  return (
    <VStack>
      <Box height={8} backgroundColor="#e5484d" opacity={1 + recorder.level.value / 60} />
      <Button onPress={() => void recorder.start()}>Record</Button>
      <Button onPress={async () => console.log((await recorder.stop()).uri)}>Stop</Button>
    </VStack>
  );
}
```

## Behavior and limits

Create the player or recorder in component setup to tie its lifetime to that component. Outside component scope, use the documented scope options. Configure the audio session for mixing, background playback and recording requirements. Declare microphone permission before recording. Recordings land in the cache; move files to documents when they must survive cache eviction. AAC is available on both platforms; WAV recording is iOS-only. Use the error signals and handle promises from playback and recording methods.

## Continue

Read [Permissions](permissions.md) for the related workflow. The API reference lists every method, option, event and return type.
