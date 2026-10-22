# audio

Reproduzir sons e gravar o microfone: AVPlayer e AVAudioRecorder no iOS,
MediaPlayer e MediaRecorder no Android. Vários leitores podem tocar ao mesmo
tempo; a sessão de áudio da app (interruptor de silêncio, mistura, atenuação,
segundo plano) é uma única chamada; as interrupções, como uma chamada
telefónica, põem tudo em pausa e avisam a app.

```tsx
import { Box, Button, VStack, Text, audio } from 'kuito';

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

## Leitores

`audio.player(src, options)` devolve um leitor de imediato. Pertence ao
componente que o chama durante a sua configuração (um [efeito de scope](native-modules.md#scope-effects)):
o leitor nativo é criado quando o componente é montado e libertado quando é
desmontado, e uma nova renderização ou um Live Patch mantêm o mesmo. Fora de
um componente, passe `{ scope: app }` para um leitor que a app mantém durante
toda a sua vida; uma chamada sem nenhum dos dois lança uma exceção e diz porquê.

A fonte carrega em segundo plano e `loaded` passa a true quando está pronta.
Reproduzir antes disso começa assim que estiver; no Android, `seek` antes
disso rejeita com `ERR_NOT_LOADED`.

| Fonte                                                  | Notas                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `'https://…'`, `{ uri }`                               | em streaming; o Android bloqueia `http://` em texto simples por omissão |
| `'file://…'`, p. ex. uma transferência do `fileSystem` | falha com `ERR_NOT_FOUND` se não houver nada lá                         |
| `'asset:///name'`, `fileSystem.bundle`                 | um ficheiro no bundle da app (iOS) ou nos assets do APK (Android)       |

| Opção    | Por omissão | Notas                              |
| -------- | ----------- | ---------------------------------- |
| `volume` | `1`         | 0 a 1                              |
| `rate`   | `1`         | 0,5 a 2; o tom é mantido           |
| `loop`   | `false`     | recomeça no fim                    |
| `scope`  | —           | `app` para o leitor da própria app |

| Membro                   | É                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `playing`                | Um sinal bidirecional: atribuir `true` reproduz, `false` põe em pausa. Depois do fim, reproduzir recomeça do início. |
| `volume`, `rate`, `loop` | Sinais bidirecionais: uma atribuição reflete-se de imediato e pede-o à plataforma.                                   |
| `loaded`, `buffering`    | Sinais do estado da plataforma.                                                                                      |
| `error`                  | Um sinal: porque é que a fonte não carregou ou não tocou, ou `null`.                                                 |
| `time`                   | Um valor de movimento: segundos desde o início, movido pela thread da UI durante a reprodução.                       |
| `duration`               | Um valor de movimento: segundos, 0 até carregar e numa emissão em direto.                                            |
| `play()`, `pause()`      | O mesmo que atribuir `playing`, como promessa.                                                                       |
| `seek(seconds)`          | Exato, não ao key frame mais próximo.                                                                                |
| `watch('ended', fn)`     | Chama `fn` sempre que a reprodução chega ao fim; num leitor em loop, a cada volta.                                   |

Uma escrita que a plataforma rejeita repõe o sinal e passa pelo canal de
erro; um valor fora do intervalo (um volume acima de 1) é rejeitado da mesma
forma. Erros de argumentos no próprio `audio.player` (uma fonte que não é um
URI) são `TypeError`s antes de algo atravessar a fronteira.

### Tempo sem eventos

A plataforma reporta um leitor apenas quando o seu estado muda: começa ou
para, armazena em buffer, procura, termina ou muda de velocidade. Não há
relatório periódico de progresso. Cada relatório ancora `time`: enquanto o
leitor toca, o kernel dá à thread da UI uma temporização linear desde o tempo
reportado até ao fim, à velocidade do leitor, e a thread da UI move `time` ao
longo dela a cada frame; em pausa, a carregar ou em buffering, `time` fica
onde a plataforma disse. Assim, uma barra de progresso ligada a `time` não
custa nada à thread de JS enquanto a música toca, e uma leitura de
`time.value` na thread de JS devolve o ponto onde a thread da UI o tem.

## Gravadores

`audio.recorder(options)` devolve um gravador com a mesma posse; nada toca no
microfone até `start`.

| Opção      | Por omissão | Notas                                                            |
| ---------- | ----------- | ---------------------------------------------------------------- |
| `format`   | `'aac'`     | `'aac'` escreve `.m4a`; `'wav'` é PCM de 16 bits, **apenas iOS** |
| `quality`  | `'high'`    | ver abaixo                                                       |
| `metering` | `false`     | mede o nível de entrada em `level`                               |
| `scope`    | —           | `app` para o gravador da própria app                             |

| Qualidade | Taxa de amostragem | Canais | Taxa de bits AAC |
| --------- | ------------------ | ------ | ---------------- |
| `low`     | 22 050 Hz          | 1      | 64 kbps          |
| `medium`  | 44 100 Hz          | 1      | 96 kbps          |
| `high`    | 44 100 Hz          | 2      | 128 kbps         |

| Membro      | É                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `start()`   | Pede o microfone, depois inicia um novo ficheiro no diretório de cache, ou retoma um em pausa.                      |
| `pause()`   | Põe o ficheiro em pausa; `start` retoma-o.                                                                          |
| `stop()`    | Termina o ficheiro e resolve `{ uri, duration }`; o `start` seguinte começa um novo ficheiro.                       |
| `recording` | Um sinal.                                                                                                           |
| `time`      | Um valor de movimento: segundos gravados, movido pela thread da UI durante a gravação.                              |
| `level`     | Um valor de movimento: o nível de entrada em dBFS, −160 (silêncio) a 0, suavizado entre amostras durante a medição. |
| `error`     | Um sinal: porque é que o gravador não pôde ser criado.                                                              |

Durante a medição, a plataforma amostra o nível a cada 100 ms e a thread da
UI suaviza `level` até cada amostra durante o mesmo tempo; sem medição, um
gravador reporta apenas quando começa e quando para. Desmontar o seu
componente para-o, apaga um ficheiro inacabado e liberta-o.

A permissão do microfone passa por [permissões](permissions.md):
declare `permissions.microphone` em `kuito.config.ts`, ou `start` rejeita com
`ERR_PERMISSION` e diz porquê. `start` pede a permissão quando o utilizador
ainda não respondeu, e rejeita com `ERR_PERMISSION` quando ele recusa. No iOS
precisa ainda de `audio.configure({ allowsRecording: true })` antes, ou
rejeita com `ERR_AUDIO_MODE`.

O Android não tem codificador WAV no MediaRecorder: um gravador `'wav'` falha
aí com `ERR_UNSUPPORTED`, e o seu `error` di-lo.

## O modo de áudio

`audio.configure(changes)` funde `changes` no modo definido até então; as
chaves que omite mantêm o seu valor. Os leitores e gravadores usam os valores
por omissão até a app os configurar.

| Chave                     | Por omissão | iOS (AVAudioSession)                                                     | Android                                               |
| ------------------------- | ----------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `playsInSilentMode`       | `true`      | `.playback`; caso contrário `.soloAmbient`, ou `.ambient` quando mistura | sem interruptor de silêncio: ignorado                 |
| `mixWithOthers`           | `false`     | `.mixWithOthers`                                                         | não pede o foco de áudio                              |
| `duckOthers`              | `false`     | `.duckOthers` (e `.playback`)                                            | `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`                  |
| `allowsRecording`         | `false`     | `.playAndRecord`, para o altifalante e Bluetooth                         | ignorado: gravar precisa apenas da permissão          |
| `staysActiveInBackground` | `false`     | `.playback`; precisa de `ios.backgroundModes: ['audio']`                 | um serviço em primeiro plano de reprodução multimédia |

O modo é da app, não apenas dos leitores de `audio`: os [vídeos](video.md#audio-the-background-and-picture-in-picture)
também tocam sob ele.

Sem `staysActiveInBackground`, os leitores e gravadores ficam em pausa quando
a app passa para segundo plano, em ambas as plataformas. Com ele, o iOS
precisa do modo de segundo plano de áudio em `kuito.config.ts`
([definições nativas](apps.md#native-settings)); `configure` rejeita com
`ERR_AUDIO_MODE` e diz porquê quando falta.

No Android, um leitor que toca neste modo, ou um
[vídeo](video.md#audio-the-background-and-picture-in-picture), inicia um
serviço em primeiro plano de reprodução multimédia, que mantém o processo
vivo e mostra uma notificação multimédia com o nome da app e um controlo de
reproduzir/pausa (no Android 13 e posteriores, nos controlos multimédia das
Definições rápidas). O módulo declara o serviço e as permissões
`FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_MEDIA_PLAYBACK` na sua
especificação (`native/modules/audio/audio.ts`), pelo que uma app que importa
`audio` não precisa de nenhuma definição própria. As notificações multimédia
não precisam da permissão de notificações. A notificação segue os leitores:

| O que acontece                                             | O serviço e a notificação                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| um leitor ou um vídeo toca                                 | em primeiro plano; o controlo põe todos em pausa                                  |
| a pausa da notificação                                     | fora do primeiro plano; a notificação fica, pode ser deslizada para fora e retoma |
| uma chamada ou outra interrupção transitória               | fica em primeiro plano, para que a app possa retomar quando `ended` chegar        |
| a app põe em pausa, o último leitor termina ou é libertado | parado, e a notificação desaparece                                                |
| `configure` desliga `staysActiveInBackground`              | parado                                                                            |

O Android 12 e posteriores só iniciam um serviço em primeiro plano enquanto a
app está em primeiro plano, ou a partir da sua notificação: `play` neste modo
a partir do segundo plano rejeita com `ERR_AUDIO_MODE` e o leitor fica em
pausa. Inicie a reprodução antes de a app sair do ecrã. A notificação não
nomeia nenhuma faixa: os leitores não transportam metadados.

## Interrupções

Uma chamada telefónica, um alarme ou outra app a tomar o foco de áudio põem em
pausa todos os leitores e gravadores, e `audio.watch('interruption', fn)` ouve
`{ type: 'began' }` e depois `{ type: 'ended', shouldResume }` quando termina.
Retomar é decisão da app: `shouldResume` é a sugestão do sistema. Num
componente, a escuta termina quando ele é desmontado; noutro lado, o
`remove()` da subscrição devolvida termina-a.

- iOS: `AVAudioSession.interruptionNotification`; `shouldResume` é a sua
  opção `.shouldResume`.
- Android: perder o foco de áudio. Uma perda transitória (uma chamada) termina
  quando o foco volta, com `shouldResume: true`; uma perda permanente (outra
  app multimédia) nunca termina. Um pedido de atenuação é tratado pelo
  sistema, que baixa ele próprio o volume desta app.

## Leitores e gravadores são objetos nativos

Cada leitor e gravador é um objeto nativo que o módulo guarda sob um id. O
seu scope liberta-o: o componente que o criou, quando é desmontado, ou, com
`{ scope: app }`, um reload, que liberta todos juntamente com o runtime. Não
há nenhum `release()` para esquecer. A plataforma atribui os ids, pelo que um
Live Patch que reavalia este módulo nunca reutiliza um que um objeto vivo
ainda tem.

## Porquê MediaPlayer, e não Media3

O Android reproduz através do MediaPlayer e grava através do MediaRecorder,
ambos na plataforma, e a sua notificação em segundo plano usa o MediaSession
da plataforma: o módulo não acrescenta nenhuma dependência. O Media3
(ExoPlayer) acrescenta cerca de 1,5 MB e traz listas de reprodução sem
intervalos, streams adaptativos (HLS, DASH) e uma sessão multimédia, nada do
que esta API expõe. O [Vídeo](video.md) precisa deles e usa o Media3. `audio`
pode passar para ele sem mudar a sua API JavaScript, e uma app que renderiza
vídeos pagaria então o Media3 uma só vez; uma que importa apenas `audio` não
paga nada. O iOS usa o AVFoundation, que vem com o sistema.

## Erros

| Código              | Significado                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_NOT_FOUND`     | Nada numa fonte `file://` ou `asset:///`, ou o leitor foi libertado.                                                               |
| `ERR_PERMISSION`    | A permissão do microfone foi recusada, ou não está declarada em `kuito.config.ts`.                                                |
| `ERR_AUDIO_MODE`    | iOS: gravar sem `allowsRecording`, ou segundo plano sem o modo. Android: tocar no modo de segundo plano a partir do segundo plano. |
| `ERR_RECORDING`     | O gravador não conseguiu começar, ou parou antes de escrever qualquer áudio.                                                       |
| `ERR_NOT_RECORDING` | `stop` sem nada gravado desde o último `stop`.                                                                                     |
| `ERR_NOT_LOADED`    | Android: `seek` antes de a fonte carregar.                                                                                         |
| `ERR_UNSUPPORTED`   | Android: um gravador `'wav'`.                                                                                                      |

O módulo nativo é `Audio` (`native/modules/audio`); uma app que nunca importa
`audio` não inclui nada dele.
