# Video

`Video` lit une vidéo : AVPlayer sur iOS, Media3 ExoPlayer sur Android. Elle lit les flux HLS, le MP4 progressif et les fichiers locaux, avec ou sans les commandes de la plateforme, passe en plein écran, et sur iOS en image dans l'image. Plusieurs peuvent jouer en même temps.

Utilisez-la pour :

- une bande-annonce ou un clip avec les commandes de la plateforme ;
- une vidéo d'arrière-plan en boucle et sans son ;
- un lecteur sur mesure avec ses propres boutons et sa barre de progression.

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

`src` est `{ uri }` : un flux HLS `.m3u8`, un `.mp4` progressif, ou une URI `file://` comme un téléchargement de `fileSystem`. Une Video est une [vue native](../../../../docs/native-modules.md#views) sans taille propre : donnez-lui une `height`, et une `width` ou laissez-la s'étirer.

## Cas d'usage

### Créer vos propres commandes

`videoRef()` fabrique une ref qui tient aussi l'état du lecteur : `playing`, `loaded`, `buffering`, `fullscreen`, `pictureInPicture` et `error` sont des signaux. Son `current` porte les méthodes, chacune une Promise qui se résout une fois que le lecteur l'a fait.

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

`paused` et `play()`/`pause()` décident tous deux si la vidéo joue : les appels agissent aussitôt, et la prop ne s'applique que quand sa valeur change.

### Suivre la lecture sans événements

Les `time` et `duration` de la ref sont des valeurs de mouvement que le thread UI fait avancer entre les rapports du lecteur. Une prop qui leur est liée n'a donc pas besoin de `onProgress`, et JavaScript ne reçoit rien pendant la lecture. Cette barre s'éclaircit à mesure que la vidéo avance.

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

### Boucler un arrière-plan sans son

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

### Lire la suivante à la fin

`watch('ended', fn)` appelle `fn` chaque fois que la lecture atteint la fin.

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

## Différences entre plateformes

|                    | iOS                                              | Android                                                         |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------- |
| Lecteur            | AVPlayer, `controls` avec AVPlayerViewController | Media3 ExoPlayer, `controls` avec son PlayerView                |
| HLS                | D'après le flux                                  | D'après le `.m3u8` dans l'URI                                   |
| Image dans l'image | Oui, avec le mode audio d'arrière-plan           | Non : `startPictureInPicture` est rejeté avec `ERR_UNSUPPORTED` |

## Permissions et configuration

Video joue sous le mode audio de l'app, celui que fixe [`audio.configure`](../../../../docs/audio.md#the-audio-mode). Les vidéos se mettent en pause quand l'app passe en arrière-plan, sauf si ce mode a `staysActiveInBackground`, qui sur iOS requiert le mode audio d'arrière-plan, tout comme l'image dans l'image :

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Films',
  ios: { bundleIdentifier: 'com.example.films', backgroundModes: ['audio'] },
  android: { applicationId: 'com.example.films' },
} satisfies KuitoConfig;
```

## Accessibilité

Avec `controls`, les commandes de la plateforme sont lues par son lecteur d'écran. Des commandes sur mesure ont besoin de leurs propres titres, comme les boutons ci-dessus.

## Voir aussi

- [Camera](./camera.md), pour en enregistrer une
- [Audio](../../../../docs/audio.md)
- [Video en profondeur](../../../../docs/video.md)
