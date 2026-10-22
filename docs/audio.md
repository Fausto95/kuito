# audio

Play sounds and record the microphone: AVPlayer and AVAudioRecorder on iOS,
MediaPlayer and MediaRecorder on Android. Several players can play at once;
the app's audio session (silent switch, mixing, ducking, background) is one
call; interruptions such as a phone call pause everything and tell the app.

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

## Players

`audio.player(src, options)` returns a player at once. It belongs to the
component that calls it while setting up (a [scope effect](native-modules.md#scope-effects)):
the native player is made when the component mounts and released when it
unmounts, and a re-render or a Live Patch keeps the same one. Outside a
component, pass `{ scope: app }` for a player the app holds for its life; a
call with neither throws and says so.

The source loads in the background and `loaded` turns true when it is ready.
Playing before then starts once it is; on Android, `seek` before then rejects
with `ERR_NOT_LOADED`.

| Source                                     | Notes                                                        |
| ------------------------------------------ | ------------------------------------------------------------ |
| `'https://…'`, `{ uri }`                   | streamed; Android blocks cleartext `http://` by default      |
| `'file://…'`, e.g. a `fileSystem` download | fails with `ERR_NOT_FOUND` if nothing is there               |
| `'asset:///name'`, `fileSystem.bundle`     | a file in the app bundle (iOS) or the APK's assets (Android) |

| Option   | Default | Notes                          |
| -------- | ------- | ------------------------------ |
| `volume` | `1`     | 0 to 1                         |
| `rate`   | `1`     | 0.5 to 2; the pitch is kept    |
| `loop`   | `false` | starts over at the end         |
| `scope`  | —       | `app` for the app's own player |

| Member                   | Is                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `playing`                | A two-way signal: assigning `true` plays, `false` pauses. After the end, playing starts over. |
| `volume`, `rate`, `loop` | Two-way signals: an assignment shows at once and asks the platform.                           |
| `loaded`, `buffering`    | Signals of the platform's state.                                                              |
| `error`                  | A signal: why the source failed to load or play, or `null`.                                   |
| `time`                   | A motion value: seconds from the start, moved by the UI thread while playing.                 |
| `duration`               | A motion value: seconds, 0 until loaded and for a live stream.                                |
| `play()`, `pause()`      | The same as assigning `playing`, as a promise.                                                |
| `seek(seconds)`          | Exact, not to the nearest key frame.                                                          |
| `watch('ended', fn)`     | Calls `fn` each time playback reaches the end; a looping player each time round.              |

A write the platform rejects puts the signal back and goes through the error
seam; a value out of range (a volume above 1) is rejected the same way.
Argument mistakes in `audio.player` itself (a source that isn't a URI) are
`TypeError`s before anything crosses.

### Time without events

The platform reports a player only when its state changes: it starts or
stops, buffers, seeks, ends, or changes rate. There is no periodic progress
report. Each report anchors `time`: while the player plays, the kernel gives
the UI thread a linear timing from the reported time to the end at the
player's rate, and the UI thread moves `time` along it every frame; paused,
loading or buffering, `time` holds where the platform said. So a progress bar
bound to `time` costs the JS thread nothing while the song plays, and a read
of `time.value` on the JS thread returns where the UI thread has it.

## Recorders

`audio.recorder(options)` returns a recorder owned the same way; nothing
touches the microphone until `start`.

| Option     | Default  | Notes                                                      |
| ---------- | -------- | ---------------------------------------------------------- |
| `format`   | `'aac'`  | `'aac'` writes `.m4a`; `'wav'` is 16-bit PCM, **iOS only** |
| `quality`  | `'high'` | see below                                                  |
| `metering` | `false`  | measures the input level into `level`                      |
| `scope`    | —        | `app` for the app's own recorder                           |

| Quality  | Sample rate | Channels | AAC bit rate |
| -------- | ----------- | -------- | ------------ |
| `low`    | 22 050 Hz   | 1        | 64 kbps      |
| `medium` | 44 100 Hz   | 1        | 96 kbps      |
| `high`   | 44 100 Hz   | 2        | 128 kbps     |

| Member      | Is                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start()`   | Asks for the microphone, then starts a new file in the cache directory, or resumes a paused one.                                                         |
| `pause()`   | Pauses the file; `start` resumes it.                                                                                                                     |
| `stop()`    | Finishes the file and resolves `{ uri, duration }`; the next `start` begins a new file. `fileSystem.readBytes(uri)` gives its bytes as an `ArrayBuffer`. |
| `recording` | A signal.                                                                                                                                                |
| `time`      | A motion value: seconds recorded, moved by the UI thread while recording.                                                                                |
| `level`     | A motion value: the input level in dBFS, −160 (silence) to 0, eased between samples while metering.                                                      |
| `error`     | A signal: why the recorder could not be made.                                                                                                            |

While metering, the platform samples the level every 100 ms and the UI thread
eases `level` to each sample over the same time; without metering a recorder
reports only when it starts and stops. Unmounting its component stops it,
deletes an unfinished file and frees it.

The microphone permission goes through [permissions](permissions.md):
declare `permissions.microphone` in `kuito.config.ts`, or `start` rejects with
`ERR_PERMISSION` and says so. `start` prompts when the user hasn't answered
yet, and rejects with `ERR_PERMISSION` when they decline. On iOS it also needs
`audio.configure({ allowsRecording: true })` first, or rejects with
`ERR_AUDIO_MODE`.

Android has no WAV encoder in MediaRecorder: a `'wav'` recorder fails there
with `ERR_UNSUPPORTED`, and its `error` says so.

## The audio mode

`audio.configure(changes)` merges `changes` into the mode set so far; keys it
leaves out keep their value. Players and recorders use the defaults until the
app configures them.

| Key                       | Default | iOS (AVAudioSession)                                             | Android                                      |
| ------------------------- | ------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `playsInSilentMode`       | `true`  | `.playback`; otherwise `.soloAmbient`, or `.ambient` when mixing | no silent switch: ignored                    |
| `mixWithOthers`           | `false` | `.mixWithOthers`                                                 | doesn't request audio focus                  |
| `duckOthers`              | `false` | `.duckOthers` (and `.playback`)                                  | `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`         |
| `allowsRecording`         | `false` | `.playAndRecord`, to the speaker and Bluetooth                   | ignored: recording needs only the permission |
| `staysActiveInBackground` | `false` | `.playback`; needs `ios.backgroundModes: ['audio']`              | a media playback foreground service          |

The mode is the app's, not `audio`'s players' alone: [videos](video.md#audio-the-background-and-picture-in-picture)
play under it too.

Without `staysActiveInBackground`, players and recorders pause when the app
goes to the background, on both platforms. With it, iOS needs the audio
background mode in `kuito.config.ts`
([native settings](apps.md#native-settings)); `configure` rejects with
`ERR_AUDIO_MODE` and says so when it is missing.

On Android, a player that plays in this mode, or a
[video](video.md#audio-the-background-and-picture-in-picture), starts a media
playback foreground service, which keeps the process alive and shows a media
notification with the app's name and a play/pause control (on Android 13 and
later, in the media controls of Quick Settings). The module declares the
service and the `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
permissions in its spec (`native/modules/audio/audio.ts`), so an app that
imports `audio` needs no setting of its own. Media notifications don't need the notification
permission. The notification follows the players:

| What happens                                            | The service and notification                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| a player or a video plays                               | in the foreground; the control pauses all of them                              |
| the notification's pause                                | out of the foreground; the notification stays, can be swiped away, and resumes |
| a call or another transient interruption                | stays in the foreground, so the app can resume when `ended` arrives            |
| the app pauses, the last player finishes or is released | stopped, and the notification gone                                             |
| `configure` turns `staysActiveInBackground` off         | stopped                                                                        |

Android 12 and later start a foreground service only while the app is in the
foreground, or from its notification: `play` in this mode from the background
rejects with `ERR_AUDIO_MODE` and the player stays paused. Start playback
before the app leaves the screen. The notification names no track: players
carry no metadata.

## Interruptions

A phone call, an alarm, or another app taking audio focus pauses every player
and recorder, and `audio.watch('interruption', fn)` hears
`{ type: 'began' }`, then `{ type: 'ended', shouldResume }` when it is over.
Resuming is the app's call: `shouldResume` is the system's suggestion. In a
component the watch ends when it unmounts; elsewhere the returned
subscription's `remove()` ends it.

- iOS: `AVAudioSession.interruptionNotification`; `shouldResume` is its
  `.shouldResume` option.
- Android: losing audio focus. A transient loss (a call) ends with focus coming
  back and `shouldResume: true`; a permanent loss (another media app) never
  ends. A request to duck is handled by the system, which lowers this app's
  volume itself.

## Players and recorders are native objects

Each player and recorder is a native object the module keeps under an id. Its
scope frees it: the component that made it when it unmounts, or, for `{ scope:
app }`, a reload, which releases every one with the runtime. There is no
`release()` to forget. The platform hands out the ids, so a Live Patch that
re-evaluates this module never reuses one a live object still has.

## Why MediaPlayer, and not Media3

Android plays through MediaPlayer and records through MediaRecorder, both in
the platform, and its background notification uses the platform's
MediaSession: the module adds no dependency. Media3 (ExoPlayer) adds about
1.5 MB and buys gapless playlists, adaptive streams (HLS, DASH) and a media
session, none of which this API exposes. [Video](video.md) needs those and
uses Media3. `audio` can move onto it without changing its JavaScript API, and
an app that renders videos would then pay for Media3 once; one that imports
only `audio` pays nothing. iOS uses AVFoundation, which ships with the system.

## Errors

| Code                | Meaning                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`     | Nothing at a `file://` or `asset:///` source, or the player was released.                                                              |
| `ERR_PERMISSION`    | The microphone permission is denied, or not declared in `kuito.config.ts`.                                                             |
| `ERR_AUDIO_MODE`    | iOS: recording without `allowsRecording`, or background without the mode. Android: playing in the background mode from the background. |
| `ERR_RECORDING`     | The recorder couldn't start, or stopped before writing any audio.                                                                      |
| `ERR_NOT_RECORDING` | `stop` with nothing recorded since the last `stop`.                                                                                    |
| `ERR_NOT_LOADED`    | Android: `seek` before the source loaded.                                                                                              |
| `ERR_UNSUPPORTED`   | Android: a `'wav'` recorder.                                                                                                           |

The native module is `Audio` (`native/modules/audio`); an app that never
imports `audio` ships none of it.
