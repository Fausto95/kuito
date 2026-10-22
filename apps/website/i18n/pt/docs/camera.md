# Câmara

`Camera` é uma pré-visualização de câmara em direto que tira fotografias e grava vídeos:
AVFoundation no iOS, CameraX no Android. É uma
[vista nativa](native-modules.md#views) do módulo `Camera`, pelo que se dispõe como qualquer
vista, e a sua ref tira as fotografias.

```tsx
import { Image, signal, Camera, cameraRef } from 'kuito';

const camera = cameraRef(); // while a component sets up, like ref()
const photo = signal<string | null>(null);

<Camera ref={camera} flex={1} facing="back" onError={(event) => warn(event.message)} />;

<Text>{camera.ready.value ? 'Ready' : 'Starting…'}</Text>;

const picture = await camera.current?.takePicture({ quality: 0.8 });

photo.value = picture?.uri ?? null; // file:// in the cache: <Image src> and fileSystem read it
```

`demo/camera.tsx` exercita tudo o que se segue (`--entry camera.tsx` em `demo/`).

## Props

| Prop        | Predefinição | Significado                                                                                   |
| ----------- | ------------ | --------------------------------------------------------------------------------------------- |
| `facing`    | `'back'`     | `'back'` ou `'front'`. Mudar volta a associar a câmara.                                       |
| `mode`      | `'picture'`  | `'picture'`, ou `'video'` para gravar. O modo de vídeo também pode tirar fotografias.         |
| `flash`     | `'off'`      | `'off'`, `'on'` ou `'auto'`, para fotografias. Uma câmara sem flash ignora-o.                 |
| `torch`     | `false`      | Mantém a luz acesa enquanto a pré-visualização corre.                                         |
| `zoom`      | `0`          | De 0 (nenhum) a 1 (o máximo que a câmara consegue), linearmente; limitado a esse intervalo.   |
| `mute`      | `false`      | Grava sem som, e sem pedir o microfone.                                                       |
| `barcodes`  | nenhum       | Procura estes códigos enquanto a pré-visualização corre. Ver [Códigos de barras](#barcodes).  |
| `onReady`   |              | A pré-visualização arrancou: podem começar fotografias e gravações. De novo após cada retoma. |
| `onError`   |              | `{ code, message }`. Ver [Erros](#errors).                                                    |
| `onBarcode` |              | `{ format, data, bounds }` de cada vez que um código entra em vista; `bounds` em pontos.      |

A pré-visualização preenche a vista e corta o que transborda (`aspectFill`), por isso dê à
vista a forma que quer que o utilizador veja. A fotografia capturada é o frame inteiro
do sensor, não o recorte.

## Métodos da ref

`cameraRef()` cria uma ref que também guarda o estado da câmara como sinais:
`ready` enquanto a pré-visualização corre e a câmara pode tirar fotografias e gravar,
e `error`, o último `{ code, message }` com que falhou. Um
`ref<CameraHandle>()` simples chega para os métodos apenas. `current` guarda o elemento da
vista, com estes ([como as vistas nativas recebem métodos](native-modules.md#how-views-work)):

| Método                     | Resolve com                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `takePicture(options?)`    | `{ uri, width, height, base64? }`: um JPEG na vertical no diretório de cache.            |
| `startRecording(options?)` | `{ uri, duration }` (segundos), quando a gravação termina, seja o que for que a termine. |
| `stopRecording()`          | O mesmo `{ uri, duration }`, quando o ficheiro está completo.                            |
| `pausePreview()`           | Congela o último frame e para a câmara, mantendo a vista.                                |
| `resumePreview()`          | Volta a iniciar a câmara; `onReady` segue-se.                                            |

`takePicture` aceita `{ quality, base64 }`: qualidade JPEG de 0 a 1 (1 por
predefinição), e o JPEG em base64 sem prefixo `data:`. `startRecording`
aceita `{ maxDuration }` em segundos, e precisa de `mode="video"`. Uma gravação termina
com `stopRecording`, ao atingir `maxDuration`, quando a app sai do primeiro plano, ou
quando a vista é desmontada; o ficheiro fica completo em todos os casos e
`startRecording` resolve com ele. Os vídeos são MPEG-4 com vídeo H.264, em HD
quando a câmara o permite.

As chamadas rejeitam com um `NativeModuleError`:

| Código               | Quando                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| `ERR_NOT_READY`      | A câmara não está a correr: antes de `onReady`, em pausa ou em segundo plano.    |
| `ERR_MODE`           | `startRecording` sem `mode="video"`.                                             |
| `ERR_RECORDING`      | Gravar duas vezes, parar sem gravação em curso, ou a gravação falhou.            |
| `ERR_PERMISSION`     | O microfone foi recusado; grave com `mute`, ou peça de novo.                     |
| `ERR_VIEW_NOT_FOUND` | A vista foi desmontada ([vistas nativas](native-modules.md#a-view-on-the-wire)). |

## Ciclo de vida

- **Permissão.** A vista pede `camera` através de
  [Permissions](permissions.md) na primeira vez que deve correr, e de novo de cada
  vez que volta ao ecrã depois de uma recusa. Uma recusa é um `onError` com
  `ERR_PERMISSION`. Peça mais cedo com `permissions.request('camera')` para escolher
  quando o pedido aparece. Gravar com som pede `microphone` da mesma
  forma, em `startRecording`.
- **Quando corre.** A câmara corre enquanto a vista está no ecrã (numa janela
  e visível), a app está em primeiro
  plano ([AppState](app-state.md)) e a pré-visualização não está em pausa. Para
  nos restantes casos, para que outra app a possa usar, e `onReady` dispara de cada vez que
  volta a arrancar.
- **Libertação.** Desmontar a vista liberta a câmara, tal como um recarregamento
  do runtime: ambos chegam ao `unmount` da vista ([vistas nativas](native-modules.md#views)).
  Uma gravação em curso termina, e `startRecording` resolve com ela.
  Sair do ecrã, como debaixo de um ecrã empilhado, apenas para a câmara; a
  vista mantém a sua configuração e volta a arrancar quando regressa.
- **Os erros são reportados uma vez** até a câmara voltar a arrancar: a vista tenta de novo
  o que falhou a cada mudança, e uma falha repetida fica em silêncio.

## Erros

`onError` recebe `{ code, message }`:

| Código                   | Significado                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `ERR_PERMISSION`         | O acesso à câmara está recusado, ou o iOS não tem texto de utilização para pedir.       |
| `ERR_CAMERA_UNAVAILABLE` | Este dispositivo não tem câmara virada para esse lado. O Simulador iOS não tem nenhuma. |
| `ERR_CAMERA`             | A sessão falhou ou o sistema parou a câmara (outra app ficou com ela).                  |

## Códigos de barras

`barcodes` procura `qr`, `aztec`, `datamatrix`, `pdf417`, `ean13`,
`ean8`, `upc_e`, `code39`, `code93`, `code128` e `itf14`.
`onBarcode` dispara uma vez por código quando entra em vista, com o seu
`format`, `data` e `bounds`, a caixa do código em pontos da vista a partir do seu
canto superior esquerdo. O `type` do próprio evento é `barcodeScanned`. Um código que
sai da vista e volta dispara de novo.

- **iOS** lê com `AVCaptureMetadataOutput`, que não custa nada extra.
- **Android** acrescenta um use case `ImageAnalysis` enquanto `barcodes` não está
  vazio, e descodifica os seus frames com o leitor de códigos de barras do ML Kit, com o
  modelo incluído na app. Descodifica-se um frame de cada vez; os frames que chegam
  entretanto são descartados. As caixas são mapeadas do frame de análise através da
  `PreviewView`, para que caiam onde o código aparece na pré-visualização recortada.

Ambas as plataformas reportam um código UPC-A como `ean13`, com os dados precedidos de um zero.
O `itf14` do Android lê códigos Interleaved 2 of 5 de qualquer comprimento; o iOS lê
apenas os de 14 dígitos.

### Porquê o ML Kit incluído no Android

O Android não tem descodificador de códigos de barras próprio. As opções eram:

- **ML Kit, variante Play Services** (`play-services-mlkit-barcode-scanning`)
  acrescenta quase nada ao APK, mas o modelo é transferido através dos Google
  Play Services na primeira utilização: a leitura não encontra nada até ele chegar, e
  nunca em dispositivos sem Play Services (Huawei, Amazon, builds AOSP, muitas
  imagens de emulador).
- **ZXing core** é Java puro e tem cerca de 0,5 MB, mas está em modo de
  manutenção, deixa-nos a conversão dos frames da câmara, e lê códigos pequenos, inclinados ou
  desfocados visivelmente pior do que o ML Kit.
- **ML Kit, incluído** (`com.google.mlkit:barcode-scanning:17.3.0`) funciona em
  todos os dispositivos desde o primeiro frame, lê os onze formatos, e descodifica
  códigos inclinados e parcialmente danificados.

O ML Kit incluído custa cerca de 2,4 MB por app, pagos por todas as apps que importam
`Camera`, leiam códigos ou não. Isso compra o mesmo comportamento em todos os dispositivos
Android, que é o que uma prop de câmara deve ter.

## Porquê o CameraX no Android

O Camera2 diretamente não custaria nada em tamanho, mas todas as apps pagariam em
comportamento: o Camera2 deixa os tamanhos dos streams, as transformações da pré-visualização, a orientação, a
rotação do sensor, a gravação com `MediaRecorder`, e dezenas de particularidades de dispositivos
a cargo de quem chama. O CameraX é a camada da Google por cima dele e trata disso, com
`PreviewView`, `ImageCapture` e `VideoCapture`, que este módulo usa tal como são.
O custo: o CameraX 1.5.3 (`camera-core`, `camera-camera2`, `camera-lifecycle`,
`camera-video`, `camera-view`) tem cerca de 2,5 MB de ficheiros de classes antes do dexing;
é habitualmente estimado em cerca de 1 MB num APK de release reduzido (não medido aqui:
a CLI ainda não tem build de release). Os módulos só são incluídos nas apps que os importam
([que módulos uma shell inclui](native-modules.md#which-modules-a-shell-includes)),
pelo que só as apps que renderizam um `Camera` o pagam. O CameraX 1.6 precisa de compileSdk
36 e AGP 8.9; a shell está em 35 e 8.7, pelo que o módulo fica em 1.5.

Cada vista é o seu próprio `LifecycleOwner` do CameraX: resumed enquanto a câmara
deve correr, created enquanto não deve (desanexada, escondida, em segundo plano ou
em pausa), e destroyed quando a vista é desmontada, para que o CameraX abra, feche e
desassocie o dispositivo sem código nosso na activity.

## O módulo

`native/modules/camera`: a sua especificação, `camera.ts`, importa `Permissions` e
`AppState`, pelo que uma shell com a câmara tem ambos. Declara os textos de utilização da câmara
e do microfone do iOS (as `permissions` da app em `kuito.config.ts`
substituem-nos), `CAMERA` e `RECORD_AUDIO` do Android, e
`android.hardware.camera.any` e `android.hardware.microphone` como funcionalidades
opcionais, para que a Google Play continue a listar a app para dispositivos sem elas.

## Notas de plataforma

- **iOS** corre cada sessão de captura na sua própria fila serial; nada bloqueia
  a thread principal. As fotografias e os vídeos ficam orientados como a interface. O
  Simulador iOS não tem câmara: a vista pede permissão e reporta
  `ERR_CAMERA_UNAVAILABLE`. Fotografias, gravação, flash, luz, zoom e
  códigos de barras precisam de um dispositivo.
- **O zoom no iOS** para em 10×: para lá disso, o zoom digital é só desfoque.
- **Android**: as fotografias são recodificadas na vertical com a qualidade pedida, fora
  da thread de UI. Uma pré-visualização em pausa mantém o último frame (`PreviewView` em
  modo compatível, uma TextureView).
- **Câmara frontal**: as fotografias não são espelhadas em nenhuma das plataformas, embora a
  pré-visualização o seja.

## Ainda não

- Fotografia e vídeo para a biblioteca: guarde com
  [fileSystem](file-system.md) ou partilhe o URI; um módulo de biblioteca de media
  ficaria responsável por isso.
- Pontos de focagem e de exposição, HDR, RAW, e definições de estabilização de vídeo.
