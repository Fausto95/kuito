# Video

`Video` plays a video: AVPlayer on iOS, Media3 ExoPlayer on Android. It plays HLS streams, progressive MP4 and local files, with or without the platform's controls, goes fullscreen, and on iOS into picture in picture. Several can play at once.

Use it for:

- a trailer or a clip with the platform's controls;
- a looping, muted background video;
- a custom player with its own buttons and progress bar.

```tsx
import { Video } from 'kuito';

export default function Trailer() {
  return (
    <Video
      src={{ uri: 'https://example.com/trailer/master.m3u8' }}
      height={220}
      controls
      onError={(event) => console.log(event.code, event.message)}
    />
  );
}
```

`src` is `{ uri }`: an HLS `.m3u8` stream, a progressive `.mp4`, or a `file://` URI such as a `fileSystem` download. A Video is a [native view](../../../../docs/native-modules.md#views) with no size of its own: give it a `height`, and a `width` or let it stretch.

## Patterns

### Build your own controls

`videoRef()` makes a ref that also holds the player's state: `playing`, `loaded`, `buffering`, `fullscreen`, `pictureInPicture` and `error` are signals. Its `current` has the methods, each a Promise that resolves once the player has done it.

```tsx
import { Button, HStack, Text, VStack, Video, videoRef } from 'kuito';

export default function Player() {
  const player = videoRef();

  return (
    <VStack gap={8}>
      <Video ref={player} src={{ uri: 'https://example.com/film.mp4' }} height={220} />
      <Text>{player.playing.value ? 'Playing' : 'Paused'}</Text>
      <HStack gap={8}>
        <Button
          onPress={() =>
            void (player.playing.value ? player.current?.pause() : player.current?.play())
          }
        >
          {player.playing.value ? 'Pause' : 'Play'}
        </Button>
        <Button onPress={() => void player.current?.seek(90)}>Skip intro</Button>
        <Button onPress={() => void player.current?.enterFullscreen()}>Fullscreen</Button>
      </HStack>
    </VStack>
  );
}
```

`paused` and `play()`/`pause()` both decide whether it plays: the calls act at once, and the prop applies only when its value changes.

### Follow playback with no events

The ref's `time` and `duration` are motion values that the UI thread moves between the player's reports, so a prop bound to them needs no `onProgress`, and JavaScript hears nothing while the video plays. This bar brightens as the video plays.

```tsx
import { Box, VStack, Video, videoRef } from 'kuito';

export default function Clip() {
  const player = videoRef();

  return (
    <VStack>
      <Video
        ref={player}
        src={{ uri: 'https://example.com/clip.mp4' }}
        height={200}
        progressInterval={0}
      />
      <Box height={4} backgroundColor="#e5e7eb">
        <Box
          height={4}
          backgroundColor="#e5484d"
          opacity={
            player.duration.value > 0
              ? 0.3 + (0.7 * player.time.value) / player.duration.value
              : 0.3
          }
        />
      </Box>
    </VStack>
  );
}
```

### Loop a muted background

```tsx
import { Video } from 'kuito';

export default function Hero() {
  return (
    <Video
      src={{ uri: 'https://example.com/waves.mp4' }}
      height={320}
      muted
      loop
      objectFit="cover"
    />
  );
}
```

### Play the next one when it ends

`watch('ended', fn)` calls `fn` each time playback reaches the end.

```tsx
import { Video, signal, videoRef } from 'kuito';

const queue = ['https://example.com/1.mp4', 'https://example.com/2.mp4'];

export default function Playlist() {
  const player = videoRef();
  const index = signal(0);

  player.watch('ended', () => (index.value = (index.value + 1) % queue.length));

  return <Video ref={player} src={{ uri: queue[index.value] }} height={220} />;
}
```

## Platform differences

|                    | iOS                                              | Android                                                    |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| Player             | AVPlayer, `controls` with AVPlayerViewController | Media3 ExoPlayer, `controls` with its PlayerView           |
| HLS                | By the stream                                    | By the `.m3u8` in the URI                                  |
| Picture in picture | Yes, with the audio background mode              | No: `startPictureInPicture` rejects with `ERR_UNSUPPORTED` |

## Permissions and config

Video plays under the app's audio mode, the one [`audio.configure`](../../../../docs/audio.md#the-audio-mode) sets. Videos pause when the app goes to the background unless that mode has `staysActiveInBackground`, which on iOS needs the audio background mode, as picture in picture does:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Films',
  ios: { bundleIdentifier: 'com.example.films', backgroundModes: ['audio'] },
  android: { applicationId: 'com.example.films' },
} satisfies KuitoConfig;
```

## Accessibility

With `controls`, the platform's controls are read by its screen reader. Custom controls need titles of their own, as the buttons above have.

## Related

- [Camera](./camera.md), to record one
- [Audio](../../../../docs/audio.md)
- [Video in depth](../../../../docs/video.md)
