# Video

A video player view, after react-native-video and expo-video: AVPlayer on
iOS, Media3 ExoPlayer on Android. It plays HLS streams, progressive MP4 and
local files, with or without the platform's controls, goes fullscreen, and on
iOS into picture in picture. Several can play at once.

```tsx
import { Box, Button, VStack, Text, Video, videoRef } from 'kuito';

function Trailer() {
  const player = videoRef();

  player.watch('ended', () => console.log('done'));

  return (
    <VStack>
      <Video
        ref={player}
        src={{ uri: 'https://example.com/trailer/master.m3u8' }}
        height={220}
        controls
        onLoad={(event) => console.log(`${event.duration}s`, event.naturalSize)}
        onError={(event) => console.log(event.code, event.message)}
      />
      <Text>{player.playing.value ? 'Playing' : 'Paused'}</Text>
      {/* Moves on the UI thread with player.time. */}
      <Box
        height={4}
        opacity={player.duration.value > 0 ? 0.3 + player.time.value / player.duration.value : 0.3}
      />
      <Button onPress={() => void player.current?.seek(90)}>Skip intro</Button>
      <Button onPress={() => void player.current?.enterFullscreen()}>Fullscreen</Button>
    </VStack>
  );
}
```

A `Video` is a [native view](native-modules.md#views): it takes style and layout
props, and like any module's view it has no size of its own. Give it a
`height` (and a `width`, or let it stretch).

## Sources

| `src.uri`                                   | Notes                                                    |
| ------------------------------------------- | -------------------------------------------------------- |
| `https://…/*.m3u8`                          | HLS, adaptive; a live stream reports `duration: null`    |
| `https://…/*.mp4`                           | progressive download; Android blocks cleartext `http://` |
| `file://…`, e.g. a `fileSystem` download    | fails with `ERR_NOT_FOUND` at once if nothing is there   |
| an [ImagePicker](image-picker.md) video URI | the `file://` URI the picker returns plays as is         |

Android picks HLS by the `.m3u8` in the URI; a stream served from a URI
without it plays as progressive media and fails. Changing `src` loads the
new one; the same source again (a re-render, a Live Patch) keeps playing.

## Props

| Prop               | Default     | Notes                                                                           |
| ------------------ | ----------- | ------------------------------------------------------------------------------- |
| `src`              | none        | `{ uri }`                                                                       |
| `paused`           | `false`     | false plays once loaded; the prop applies when it changes                       |
| `muted`            | `false`     |                                                                                 |
| `volume`           | `1`         | 0 to 1                                                                          |
| `rate`             | `1`         | above 0; the pitch is kept                                                      |
| `loop`             | `false`     | starts over at the end, with an `onEnd` each time round                         |
| `objectFit`        | `'contain'` | CSS's `object-fit`: `'contain'` letterboxes, `'cover'` crops, `'fill'` distorts |
| `controls`         | `false`     | the platform's controls: AVPlayerViewController, Media3's PlayerView            |
| `progressInterval` | `250`       | milliseconds between `onProgress` events while playing                          |

A value out of range (a volume of 2, a `ftp://` source) fails as the prop's
`unsupportedValue` error, like any invalid prop.

`paused` and `play()`/`pause()` both decide whether the video plays. The ref's
calls act at once and the prop applies only when its value changes, so a
video the user paused from the controls stays paused until the app says
otherwise. Hear what it is doing with `onPlaybackStateChange`.

## Events

| Event                      | Payload                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `onLoad`                   | `{ duration, currentTime, naturalSize: { width, height } }`   |
| `onProgress`               | `{ currentTime, playableDuration }`, while playing            |
| `onBuffer`                 | `{ isBuffering }`, when it starts and stops waiting for data  |
| `onPlaybackStateChange`    | `{ isPlaying }`, whatever made it change (the controls too)   |
| `onEnd`                    | none; each time round when looping                            |
| `onError`                  | `{ code, message }`                                           |
| `onFullscreenChange`       | `{ fullscreen }`, entering and leaving, from the controls too |
| `onPictureInPictureChange` | `{ active }`                                                  |

Times are seconds. `duration` is `null` for a live stream. `playableDuration`
is how far the player has buffered.

**Progress stays off the hot path.** A `Video` without `onProgress` reports no
progress at all: the component sends the native view an interval of 0. With
it, the native view reports at most every `progressInterval`
milliseconds, and only while playing.

## The ref

`videoRef()` makes a ref that also holds the player's state; pass it as the
video's `ref`. Like `ref()`, call it while a component sets up, which owns it.

| Member                           | Is                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `current`                        | The view's element, with the methods below; `null` while it isn't mounted.                   |
| `playing`, `loaded`, `buffering` | Signals of the player's state.                                                               |
| `fullscreen`, `pictureInPicture` | Signals.                                                                                     |
| `error`                          | A signal: why the video failed, or `null`.                                                   |
| `time`                           | A motion value: seconds from the start, moved by the UI thread between the player's reports. |
| `duration`                       | A motion value: seconds, 0 until loaded and for a live stream.                               |
| `watch('ended', fn)`             | Calls `fn` each time playback reaches the end.                                               |

The player reports when it starts or stops, with where it is and its rate,
and each report, `onProgress` included, anchors `time` as a linear timing the
UI thread runs. A progress bar bound to `time` needs no `onProgress`; set
`progressInterval={0}` and the JS thread hears nothing while it plays.
A plain `ref<VideoHandle>()` still works for the methods alone.

## Ref methods

`current` holds the view's element with these functions. Each
returns a Promise that resolves once the player has done it, and rejects once
the view is no longer mounted ([view methods](native-modules.md#how-views-work)).

| Method                    | Does                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| `seek(seconds)`           | exact, not to the nearest key frame                                       |
| `play()`, `pause()`       | after the end, `play` starts over                                         |
| `enterFullscreen()`       | presents the video over the app with the platform's controls              |
| `exitFullscreen()`        | back inline; the user can also leave with the close button, swipe or back |
| `startPictureInPicture()` | **iOS only**; rejects with `ERR_UNSUPPORTED` on Android                   |
| `stopPictureInPicture()`  | **iOS only**                                                              |

Fullscreen is a second player view on the same player, so playback carries
on without a hitch: an AVPlayerViewController presented over the app on iOS,
a dialog with a PlayerView on Android. The controls' own fullscreen button
does the same, and both report `onFullscreenChange`.

## Audio, the background and picture in picture

Video plays under the app's audio mode, the one
[`audio.configure`](audio.md#the-audio-mode) sets; it never sets one of its
own. The Video module requires Audio natively for this, so an app that
renders a `Video` ships Audio's native code too (a few kilobytes, no
dependency), whether or not it imports `Audio`.

- **iOS.** Before a video plays, the app's audio session is activated with the
  mode: Audio's default plays in silent mode and stops other apps' audio, as
  a video app should. `playsInSilentMode: false` lets the silent switch mute
  videos; `mixWithOthers` keeps other apps playing.
- **Android.** Videos and Audio's players share one audio focus request, so
  several play at once, a video beside an Audio player too; a call or another
  media app pausing them is an interruption, and Audio's `interruption` event
  reports it. `mixWithOthers` asks for no focus.
- **The background.** Like Audio's players, videos pause when the app goes to
  the background, unless the mode has `staysActiveInBackground`. On iOS that
  needs the audio background mode in `kuito.config.ts`
  (`ios.backgroundModes: ['audio']`, [native settings](apps.md#native-settings));
  the video's layers let go of the player in the background so the system
  doesn't pause it. On Android a playing video starts the same media
  playback service and notification as Audio's players
  ([the audio mode](audio.md#the-audio-mode)), which keeps the app alive; the
  notification's pause and play reach the videos too. A video started in the
  background in this mode stays paused and reports `ERR_AUDIO_MODE` through
  `onError`.
- **Picture in picture** (iOS) needs the same audio background mode, or
  `startPictureInPicture` rejects with `ERR_PICTURE_IN_PICTURE` and says so,
  and a device that supports it (the iPhone simulator doesn't, and rejects
  with `ERR_UNSUPPORTED`). A video in picture in picture keeps playing when
  the app goes to the background, whatever the mode. On Android, picture in
  picture shrinks the whole activity, not one view, so it is left out.

## Players are released with their view

Each `Video` owns its player. It is released when the view leaves (an
unmount, a screen popped) and when the runtime reloads, through the native
view's `unmount` ([native views](native-modules.md#write-a-view)):
playback stops and the stream's buffers go. A Live Patch that keeps the view
keeps the player.

## Platform notes

- **iOS:** AVPlayer drawn by an AVPlayerLayer; `controls` embeds an
  AVPlayerViewController instead, joined to the nearest view controller.
- **Android:** Media3 1.9 (`media3-exoplayer`, `media3-exoplayer-hls`,
  `media3-ui`), the newest that builds against the shell's compileSdk 35. The
  picture draws into a TextureView: a SurfaceView ignores clipping, so a
  `cover` video would spill out of its view. Media3 is the cost of the
  module: about 1 MB per APK, the same for each ABI, as it has no native
  libraries ([size](#size)).

### Size

What rendering a `Video` adds to an R8 release APK of the shell, measured on
a one-screen app:

| APK       | Without Video (Audio only) | With Video | Cost |
| --------- | -------------------------- | ---------- | ---- |
| arm64-v8a | TBD                        | TBD        | TBD  |
| x86_64    | TBD                        | TBD        | TBD  |

iOS links AVFoundation and AVKit, which ship with the system.

## Errors

| Code                     | Meaning                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`          | Nothing at a `file://` source.                                                                                                |
| `ERR_PLAYBACK`           | The source failed to load or play: a network error, an unsupported codec.                                                     |
| `ERR_AUDIO_MODE`         | iOS: the audio session couldn't be activated with the app's mode. Android: played in the background mode from the background. |
| `ERR_FULLSCREEN`         | iOS: no window to present the fullscreen player in.                                                                           |
| `ERR_PICTURE_IN_PICTURE` | iOS: no audio background mode, or the system refused to start it.                                                             |
| `ERR_UNSUPPORTED`        | Picture in picture on Android, or on a device without it.                                                                     |

The module is `Video` (`native/modules/video`); an app that never renders a
`Video` ships none of it, and none of Media3.
