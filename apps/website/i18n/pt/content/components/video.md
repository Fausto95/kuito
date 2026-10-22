# Vídeo

`Video` reproduz um vídeo: AVPlayer no iOS, Media3 ExoPlayer no Android. Reproduz streams HLS, MP4 progressivo e ficheiros locais, com ou sem os controlos da plataforma, passa a ecrã inteiro e, no iOS, a picture in picture. Vários podem tocar ao mesmo tempo.

Use-o para:

- um trailer ou um clip com os controlos da plataforma;
- um vídeo de fundo em loop e sem som;
- um leitor personalizado com os seus próprios botões e barra de progresso.

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

`src` é `{ uri }`: um stream HLS `.m3u8`, um `.mp4` progressivo, ou um URI `file://` como um download do `fileSystem`. Um Video é uma [vista nativa](../../../../docs/native-modules.md#views) sem tamanho próprio: dê-lhe uma `height`, e uma `width` ou deixe-o esticar.

## Padrões

### Criar os seus próprios controlos

`videoRef()` cria uma ref que também guarda o estado do leitor: `playing`, `loaded`, `buffering`, `fullscreen`, `pictureInPicture` e `error` são sinais. O seu `current` tem os métodos, cada um uma Promise que resolve assim que o leitor o fez.

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

`paused` e `play()`/`pause()` decidem ambos se o vídeo toca: as chamadas atuam de imediato, e a prop aplica-se apenas quando o seu valor muda.

### Acompanhar a reprodução sem eventos

`time` e `duration` da ref são motion values que a thread de UI move entre os relatórios do leitor, pelo que uma prop ligada a eles não precisa de `onProgress`, e o JavaScript não ouve nada enquanto o vídeo toca. Esta barra fica mais clara à medida que o vídeo avança.

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

### Repetir um fundo sem som

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

### Reproduzir o seguinte quando termina

`watch('ended', fn)` chama `fn` de cada vez que a reprodução chega ao fim.

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

## Diferenças entre plataformas

|                    | iOS                                             | Android                                                    |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------- |
| Leitor             | AVPlayer, `controls` com AVPlayerViewController | Media3 ExoPlayer, `controls` com o seu PlayerView          |
| HLS                | Pelo stream                                     | Pelo `.m3u8` no URI                                        |
| Picture in picture | Sim, com o modo de áudio em segundo plano       | Não: `startPictureInPicture` rejeita com `ERR_UNSUPPORTED` |

## Permissões e configuração

O vídeo toca sob o modo de áudio da aplicação, o que [`audio.configure`](../../../../docs/audio.md#the-audio-mode) define. Os vídeos param quando a aplicação vai para segundo plano, a não ser que esse modo tenha `staysActiveInBackground`, o que no iOS precisa do modo de áudio em segundo plano, tal como o picture in picture:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Films',
  ios: { bundleIdentifier: 'com.example.films', backgroundModes: ['audio'] },
  android: { applicationId: 'com.example.films' },
} satisfies KuitoConfig;
```

## Acessibilidade

Com `controls`, os controlos da plataforma são lidos pelo seu leitor de ecrã. Os controlos personalizados precisam de títulos próprios, como os botões acima têm.

## Ver também

- [Camera](./camera.md), para gravar um
- [Áudio](../../../../docs/audio.md)
- [Video em profundidade](../../../../docs/video.md)
