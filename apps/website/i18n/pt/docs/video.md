# Vídeo

Uma vista de leitor de vídeo, à imagem de react-native-video e expo-video:
AVPlayer no iOS, Media3 ExoPlayer no Android. Reproduz streams HLS, MP4
progressivo e ficheiros locais, com ou sem os controlos da plataforma, passa a
ecrã inteiro e, no iOS, a picture in picture. Vários podem tocar ao mesmo
tempo.

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

Um `Video` é uma [vista nativa](native-modules.md#views): aceita props de
estilo e de layout e, como a vista de qualquer módulo, não tem tamanho
próprio. Dê-lhe uma `height` (e uma `width`, ou deixe-o esticar).

## Fontes

| `src.uri`                                            | Notas                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `https://…/*.m3u8`                                   | HLS, adaptativo; uma emissão em direto reporta `duration: null`          |
| `https://…/*.mp4`                                    | transferência progressiva; o Android bloqueia `http://` em texto simples |
| `file://…`, p. ex. uma transferência do `fileSystem` | falha de imediato com `ERR_NOT_FOUND` se não houver nada lá              |
| um URI de vídeo do [ImagePicker](image-picker.md)    | o URI `file://` que o picker devolve toca tal como está                  |

O Android escolhe HLS pelo `.m3u8` no URI; um stream servido a partir de um
URI sem ele toca como media progressivo e falha. Mudar `src` carrega o novo; a
mesma fonte de novo (uma nova renderização, um Live Patch) continua a tocar.

## Props

| Prop               | Por omissão | Notas                                                                                        |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------- |
| `src`              | nenhum      | `{ uri }`                                                                                    |
| `paused`           | `false`     | false reproduz assim que carregar; a prop aplica-se quando muda                              |
| `muted`            | `false`     |                                                                                              |
| `volume`           | `1`         | 0 a 1                                                                                        |
| `rate`             | `1`         | acima de 0; o tom é mantido                                                                  |
| `loop`             | `false`     | recomeça no fim, com um `onEnd` a cada volta                                                 |
| `objectFit`        | `'contain'` | o `object-fit` do CSS: `'contain'` enquadra com barras, `'cover'` recorta, `'fill'` distorce |
| `controls`         | `false`     | os controlos da plataforma: AVPlayerViewController, o PlayerView do Media3                   |
| `progressInterval` | `250`       | milissegundos entre eventos `onProgress` durante a reprodução                                |

Um valor fora do intervalo (um volume de 2, uma fonte `ftp://`) falha como o
erro `unsupportedValue` da prop, como qualquer prop inválida.

`paused` e `play()`/`pause()` decidem ambos se o vídeo toca. As chamadas da
ref atuam de imediato e a prop aplica-se apenas quando o seu valor muda, pelo
que um vídeo que o utilizador pôs em pausa a partir dos controlos fica em
pausa até a app dizer o contrário. Saiba o que ele está a fazer com
`onPlaybackStateChange`.

## Eventos

| Evento                     | Payload                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `onLoad`                   | `{ duration, currentTime, naturalSize: { width, height } }`           |
| `onProgress`               | `{ currentTime, playableDuration }`, durante a reprodução             |
| `onBuffer`                 | `{ isBuffering }`, quando começa e deixa de esperar por dados         |
| `onPlaybackStateChange`    | `{ isPlaying }`, seja o que for que o fez mudar (os controlos também) |
| `onEnd`                    | nenhum; a cada volta quando em loop                                   |
| `onError`                  | `{ code, message }`                                                   |
| `onFullscreenChange`       | `{ fullscreen }`, ao entrar e ao sair, também a partir dos controlos  |
| `onPictureInPictureChange` | `{ active }`                                                          |

Os tempos são em segundos. `duration` é `null` numa emissão em direto.
`playableDuration` é até onde o leitor já armazenou em buffer.

**O progresso fica fora do caminho crítico.** Um `Video` sem `onProgress` não
reporta progresso nenhum: o componente envia à vista nativa um intervalo de 0.
Com ele, a vista nativa reporta no máximo a cada `progressInterval`
milissegundos, e apenas durante a reprodução.

## A ref

`videoRef()` cria uma ref que guarda também o estado do leitor; passe-a como
`ref` do vídeo. Como `ref()`, chame-a enquanto um componente se configura, que
fica a possuí-la.

| Membro                           | É                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `current`                        | O elemento da vista, com os métodos abaixo; `null` enquanto não está montado.                           |
| `playing`, `loaded`, `buffering` | Sinais do estado do leitor.                                                                             |
| `fullscreen`, `pictureInPicture` | Sinais.                                                                                                 |
| `error`                          | Um sinal: porque é que o vídeo falhou, ou `null`.                                                       |
| `time`                           | Um valor de movimento: segundos desde o início, movido pela thread da UI entre os relatórios do leitor. |
| `duration`                       | Um valor de movimento: segundos, 0 até carregar e numa emissão em direto.                               |
| `watch('ended', fn)`             | Chama `fn` sempre que a reprodução chega ao fim.                                                        |

O leitor reporta quando começa ou para, com a posição em que está e a sua
velocidade, e cada relatório, `onProgress` incluído, ancora `time` como uma
temporização linear que a thread da UI executa. Uma barra de progresso ligada
a `time` não precisa de `onProgress`; defina `progressInterval={0}` e a thread
de JS não ouve nada durante a reprodução. Um `ref<VideoHandle>()` simples
continua a funcionar só para os métodos.

## Métodos da ref

`current` guarda o elemento da vista com estas funções. Cada uma devolve uma
Promise que resolve assim que o leitor o fez, e rejeita assim que a vista
deixa de estar montada ([métodos de vista](native-modules.md#how-views-work)).

| Método                    | Faz                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `seek(seconds)`           | exato, não ao key frame mais próximo                                                                         |
| `play()`, `pause()`       | depois do fim, `play` recomeça do início                                                                     |
| `enterFullscreen()`       | apresenta o vídeo sobre a app com os controlos da plataforma                                                 |
| `exitFullscreen()`        | de volta ao inline; o utilizador também pode sair com o botão de fechar, um deslize ou o botão de retroceder |
| `startPictureInPicture()` | **apenas iOS**; rejeita com `ERR_UNSUPPORTED` no Android                                                     |
| `stopPictureInPicture()`  | **apenas iOS**                                                                                               |

O ecrã inteiro é uma segunda vista de leitor sobre o mesmo leitor, pelo que a
reprodução continua sem sobressaltos: um AVPlayerViewController apresentado
sobre a app no iOS, um dialog com um PlayerView no Android. O botão de ecrã
inteiro dos próprios controlos faz o mesmo, e ambos reportam
`onFullscreenChange`.

## Áudio, o segundo plano e picture in picture

O vídeo toca sob o modo de áudio da app, o que
[`audio.configure`](audio.md#the-audio-mode) define; nunca define um seu. O
módulo Video requer nativamente o Audio para isso, pelo que uma app que
renderiza um `Video` inclui também o código nativo do Audio (uns quantos
kilobytes, nenhuma dependência), importe ou não `Audio`.

- **iOS.** Antes de um vídeo tocar, a sessão de áudio da app é ativada com o
  modo: a predefinição do Audio toca em modo silencioso e para o áudio das
  outras apps, como uma app de vídeo deve. `playsInSilentMode: false` deixa o
  interruptor de silêncio silenciar os vídeos; `mixWithOthers` mantém as
  outras apps a tocar.
- **Android.** Os vídeos e os leitores do Audio partilham um único pedido de
  foco de áudio, pelo que vários tocam ao mesmo tempo, um vídeo ao lado de um
  leitor do Audio também; uma chamada ou outra app multimédia a pô-los em
  pausa é uma interrupção, e o evento `interruption` do Audio reporta-a.
  `mixWithOthers` não pede foco.
- **O segundo plano.** Como os leitores do Audio, os vídeos ficam em pausa
  quando a app passa para segundo plano, a menos que o modo tenha
  `staysActiveInBackground`. No iOS isso precisa do modo de segundo plano de
  áudio em `kuito.config.ts`
  (`ios.backgroundModes: ['audio']`, [definições nativas](apps.md#native-settings));
  as layers do vídeo largam o leitor em segundo plano para que o sistema não o
  ponha em pausa. No Android, um vídeo a tocar inicia o mesmo serviço de
  reprodução multimédia e a mesma notificação que os leitores do Audio
  ([o modo de áudio](audio.md#the-audio-mode)), o que mantém a app viva; a
  pausa e o play da notificação chegam também aos vídeos. Um vídeo iniciado
  em segundo plano neste modo fica em pausa e reporta `ERR_AUDIO_MODE` através
  de `onError`.
- **Picture in picture** (iOS) precisa do mesmo modo de segundo plano de
  áudio, ou `startPictureInPicture` rejeita com `ERR_PICTURE_IN_PICTURE` e diz
  porquê, e de um dispositivo que o suporte (o simulador de iPhone não
  suporta, e rejeita com `ERR_UNSUPPORTED`). Um vídeo em picture in picture
  continua a tocar quando a app passa para segundo plano, seja qual for o
  modo. No Android, o picture in picture encolhe a activity inteira, não uma
  vista, pelo que fica de fora.

## Os leitores são libertados com a sua vista

Cada `Video` possui o seu leitor. É libertado quando a vista sai (um unmount,
um ecrã retirado da pilha) e quando o runtime recarrega, através do `unmount`
da vista nativa ([vistas nativas](native-modules.md#write-a-view)): a
reprodução para e os buffers do stream desaparecem. Um Live Patch que mantém a
vista mantém o leitor.

## Notas por plataforma

- **iOS:** AVPlayer desenhado por um AVPlayerLayer; `controls` incorpora antes
  um AVPlayerViewController, ligado ao view controller mais próximo.
- **Android:** Media3 1.9 (`media3-exoplayer`, `media3-exoplayer-hls`,
  `media3-ui`), o mais recente que compila contra o compileSdk 35 da shell. A
  imagem desenha-se numa TextureView: uma SurfaceView ignora o recorte, pelo
  que um vídeo `cover` sairia da sua vista. O Media3 é o custo do módulo:
  cerca de 1 MB por APK, o mesmo para cada ABI, já que não tem bibliotecas
  nativas ([tamanho](#size)).

### Tamanho

O que renderizar um `Video` acrescenta a um APK de release R8 da shell, medido
numa app de um só ecrã:

| APK       | Sem Video (apenas Audio) | Com Video | Custo |
| --------- | ------------------------ | --------- | ----- |
| arm64-v8a | TBD                      | TBD       | TBD   |
| x86_64    | TBD                      | TBD       | TBD   |

O iOS liga o AVFoundation e o AVKit, que vêm com o sistema.

## Erros

| Código                   | Significado                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`          | Nada numa fonte `file://`.                                                                                                         |
| `ERR_PLAYBACK`           | A fonte não carregou ou não tocou: um erro de rede, um codec não suportado.                                                        |
| `ERR_AUDIO_MODE`         | iOS: a sessão de áudio não pôde ser ativada com o modo da app. Android: tocado no modo de segundo plano a partir do segundo plano. |
| `ERR_FULLSCREEN`         | iOS: nenhuma janela onde apresentar o leitor em ecrã inteiro.                                                                      |
| `ERR_PICTURE_IN_PICTURE` | iOS: sem modo de segundo plano de áudio, ou o sistema recusou iniciá-lo.                                                           |
| `ERR_UNSUPPORTED`        | Picture in picture no Android, ou num dispositivo sem ele.                                                                         |

O módulo é `Video` (`native/modules/video`); uma app que nunca renderiza um
`Video` não inclui nada dele, nem do Media3.
