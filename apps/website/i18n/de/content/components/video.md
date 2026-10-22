# Video

`Video` spielt ein Video ab: AVPlayer auf iOS, Media3 ExoPlayer auf Android. Es spielt HLS-Streams, progressives MP4 und lokale Dateien ab, mit oder ohne die Steuerelemente der Plattform, geht in den Vollbildmodus und auf iOS in Bild-im-Bild. Mehrere können gleichzeitig abspielen.

Geeignet für:

- einen Trailer oder einen Clip mit den Steuerelementen der Plattform;
- ein stummgeschaltetes Hintergrundvideo in Schleife;
- einen eigenen Player mit eigenen Buttons und Fortschrittsbalken.

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

`src` ist `{ uri }`: ein HLS-Stream `.m3u8`, ein progressives `.mp4` oder eine `file://`-URI, etwa ein Download über `fileSystem`. Ein Video ist eine [native View](../../../../docs/native-modules.md#views) ohne eigene Größe: ihm eine `height` geben, und eine `width`, oder es sich strecken lassen.

## Muster

### Eigene Steuerelemente bauen

`videoRef()` erzeugt eine Ref, die auch den Zustand des Players hält: `playing`, `loaded`, `buffering`, `fullscreen`, `pictureInPicture` und `error` sind Signale. Ihr `current` hat die Methoden, jede ein Promise, das aufgelöst wird, sobald der Player die Aktion ausgeführt hat.

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

`paused` und `play()`/`pause()` entscheiden beide, ob es abspielt: Die Aufrufe wirken sofort, und die Prop greift nur, wenn sich ihr Wert ändert.

### Die Wiedergabe ohne Ereignisse verfolgen

`time` und `duration` der Ref sind Motion-Werte, die der UI-Thread zwischen den Meldungen des Players fortschreibt. Eine daran gebundene Prop braucht also kein `onProgress`, und JavaScript hört nichts, während das Video läuft. Dieser Balken wird heller, während das Video läuft.

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

### Einen stummen Hintergrund in Schleife abspielen

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

### Am Ende das nächste abspielen

`watch('ended', fn)` ruft `fn` jedes Mal auf, wenn die Wiedergabe das Ende erreicht.

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

## Plattformunterschiede

|              | iOS                                             | Android                                                            |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| Player       | AVPlayer, `controls` mit AVPlayerViewController | Media3 ExoPlayer, `controls` mit seiner PlayerView                 |
| HLS          | Anhand des Streams                              | Anhand von `.m3u8` in der URI                                      |
| Bild-im-Bild | Ja, mit dem Audio-Hintergrundmodus              | Nein: `startPictureInPicture` wird mit `ERR_UNSUPPORTED` abgelehnt |

## Berechtigungen und Konfiguration

Video spielt im Audiomodus der App ab, dem, den [`audio.configure`](../../../../docs/audio.md#the-audio-mode) setzt. Videos pausieren, wenn die App in den Hintergrund geht, es sei denn, dieser Modus hat `staysActiveInBackground`. Das braucht auf iOS den Audio-Hintergrundmodus, genau wie Bild-im-Bild:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Films',
  ios: { bundleIdentifier: 'com.example.films', backgroundModes: ['audio'] },
  android: { applicationId: 'com.example.films' },
} satisfies KuitoConfig;
```

## Barrierefreiheit

Mit `controls` liest der Screenreader der Plattform deren Steuerelemente vor. Eigene Steuerelemente brauchen eigene Titel, wie sie die Buttons oben haben.

## Siehe auch

- [Camera](./camera.md), um eines aufzuzeichnen
- [Audio](../../../../docs/audio.md)
- [Video im Detail](../../../../docs/video.md)
