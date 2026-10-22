# Câmara

`Camera` é uma pré-visualização de câmara em direto que tira fotografias, grava vídeos e lê códigos de barras: AVFoundation no iOS, CameraX no Android. Dispõe-se como qualquer vista, e a sua ref tira as fotografias.

Use-o para:

- uma fotografia de perfil ou um documento fotografado na aplicação;
- um pequeno clip de vídeo;
- ler um código QR ou o código de barras de um bilhete.

```tsx
import { Button, Camera, Image, VStack, cameraRef, signal } from 'kuito';

export default function Snap() {
  const camera = cameraRef();
  const photo = signal<string | null>(null);

  async function take() {
    try {
      const picture = await camera.current?.takePicture({ quality: 0.8 });

      photo.value = picture?.uri ?? null;
    } catch (error) {
      console.log('No picture:', error);
    }
  }

  return (
    <VStack flex={1}>
      <Camera
        ref={camera}
        flex={1}
        facing="back"
        onError={(event) => console.log(event.code, event.message)}
      />
      <Button disabled={!camera.ready.value} onPress={() => void take()}>
        Take picture
      </Button>
      {photo.value ? <Image src={photo.value} width={96} height={96} /> : null}
    </VStack>
  );
}
```

`cameraRef()` cria uma ref que também guarda o estado da câmara como sinais: `ready`, verdadeiro desde o primeiro `onReady` até a um erro, e `error`, o último `{ code, message }` com que falhou. Uma chamada com a câmara parada (em pausa, fora do ecrã, em segundo plano) rejeita com `ERR_NOT_READY`, por isso trate a rejeição como o exemplo faz. Chame-a enquanto um componente se configura, como `ref()`. `takePicture` resolve com um JPEG na vertical no diretório de cache, um URI `file://` que `Image` e `fileSystem` leem.

## Padrões

### Ler os bytes da fotografia

`bytes: true` devolve também os bytes do JPEG como um `ArrayBuffer`, prontos a enviar.

```tsx
import { Button, Camera, VStack, cameraRef } from 'kuito';

export default function Upload() {
  const camera = cameraRef();

  async function send() {
    const picture = await camera.current?.takePicture({ quality: 0.7, bytes: true });

    if (picture?.bytes)
      await fetch('https://example.com/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: picture.bytes,
      });
  }

  return (
    <VStack flex={1}>
      <Camera ref={camera} flex={1} />
      <Button onPress={() => void send()}>Send</Button>
    </VStack>
  );
}
```

### Gravar um vídeo

`startRecording` precisa de `mode="video"`, aceita `{ maxDuration }` em segundos, e resolve com `{ uri, duration }` assim que a gravação termina, seja o que for que a termine: `stopRecording`, `maxDuration`, a aplicação sair do primeiro plano, ou a vista desmontar. `mute` grava sem som, e sem pedir o microfone.

```tsx
import { Button, Camera, VStack, cameraRef, signal } from 'kuito';

export default function Clip() {
  const camera = cameraRef();
  const recording = signal(false);

  async function record() {
    recording.value = true;

    try {
      const clip = await camera.current?.startRecording({ maxDuration: 15 });

      console.log(clip?.uri, clip?.duration);
    } catch (error) {
      console.log('No video:', error);
    } finally {
      recording.value = false;
    }
  }

  return (
    <VStack flex={1}>
      <Camera ref={camera} mode="video" flex={1} />
      <Button
        onPress={() =>
          recording.value ? void camera.current?.stopRecording().catch(console.log) : void record()
        }
      >
        {recording.value ? 'Stop' : 'Record'}
      </Button>
    </VStack>
  );
}
```

### Ler um código QR

`barcodes` procura os formatos indicados enquanto a pré-visualização corre. `onBarcode` dispara uma vez por código à medida que entra no campo de visão, com o seu `format`, `data` e `bounds` em pontos da vista.

```tsx
import { Camera } from 'kuito';

export default function Scanner(props: { found: (data: string) => void }) {
  return (
    <Camera flex={1} barcodes={['qr', 'ean13']} onBarcode={(event) => props.found(event.data)} />
  );
}
```

## Diferenças entre plataformas

|                   | iOS                       | Android                       |
| ----------------- | ------------------------- | ----------------------------- |
| Câmara            | AVFoundation              | CameraX                       |
| Códigos de barras | `AVCaptureMetadataOutput` | ML Kit, incluído na aplicação |

O Simulador iOS não tem câmara: a vista reporta `ERR_CAMERA_UNAVAILABLE`, por isso teste as fotografias, a gravação e os códigos de barras num dispositivo. As fotografias da câmara frontal não ficam espelhadas em nenhuma das plataformas, embora a pré-visualização fique. No iOS o zoom para em 10×. Ambas reportam um código UPC-A como `ean13`, com os dados precedidos de um zero.

## Permissões e configuração

A vista pede `camera` na primeira vez que deve correr; uma recusa é um `onError` com `ERR_PERMISSION`. Gravar com som pede `microphone` em `startRecording`. Peça mais cedo com `permissions.request('camera')` para escolher quando o pedido aparece ([permissões](../../../../docs/permissions.md)). As justificações que o iOS mostra vêm de `kuito.config.ts`:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Tickets',
  ios: { bundleIdentifier: 'com.example.tickets' },
  android: { applicationId: 'com.example.tickets' },
  permissions: {
    camera: 'Scan your tickets at the door.',
    microphone: 'Record videos with sound.',
  },
} satisfies KuitoConfig;
```

A câmara corre enquanto a vista está no ecrã, a aplicação está em primeiro plano e a pré-visualização não está em pausa, e para nos outros casos para que outra aplicação a possa usar. `onReady` dispara de cada vez que arranca de novo; as chamadas antes disso rejeitam com `ERR_NOT_READY`.

## Acessibilidade

A pré-visualização não tem nada para ler. Dê um título claro ao botão que tira a fotografia, e anuncie em texto um código lido: um utilizador de leitor de ecrã pode não ver a pré-visualização.

## Ver também

- [Image](./image.md), para mostrar a fotografia
- [Video](./video.md), para reproduzir a gravação
- [Permissões](../../../../docs/permissions.md)
- [Camera em profundidade](../../../../docs/camera.md)
