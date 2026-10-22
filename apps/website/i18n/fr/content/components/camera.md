# Camera

`Camera` est un aperçu caméra en direct qui prend des photos, enregistre des vidéos et scanne des codes-barres : AVFoundation sur iOS, CameraX sur Android. Elle se dispose comme n'importe quelle vue, et sa ref prend les photos.

Utilisez-la pour :

- une photo de profil ou un document pris dans l'app ;
- un court clip vidéo ;
- scanner un QR code ou le code-barres d'un billet.

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

`cameraRef()` fabrique une ref qui tient aussi l'état de la caméra en signaux : `ready`, vrai du premier `onReady` jusqu'à une erreur, et `error`, le dernier `{ code, message }` sur lequel elle a échoué. Un appel pendant que la caméra est arrêtée (en pause, hors de l'écran, en arrière-plan) est rejeté avec `ERR_NOT_READY`, donc gérez le rejet comme le fait l'exemple. Appelez-la pendant la mise en place d'un composant, comme `ref()`. `takePicture` se résout avec un JPEG redressé dans le répertoire de cache, une URI `file://` que `Image` et `fileSystem` savent lire.

## Cas d'usage

### Lire les octets de la photo

`bytes: true` renvoie aussi les octets du JPEG sous forme d'`ArrayBuffer`, prêts à être envoyés.

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

### Enregistrer une vidéo

`startRecording` requiert `mode="video"`, prend `{ maxDuration }` en secondes, et se résout avec `{ uri, duration }` une fois l'enregistrement terminé, quoi qu'il le termine : `stopRecording`, `maxDuration`, l'app qui quitte le premier plan, ou la vue qui se démonte. `mute` enregistre sans son, et sans demander le microphone.

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

### Scanner un QR code

`barcodes` recherche les formats indiqués tant que l'aperçu tourne. `onBarcode` se déclenche une fois par code quand il entre dans le champ, avec son `format`, ses `data` et ses `bounds` en points de la vue.

```tsx
import { Camera } from 'kuito';

export default function Scanner(props: { found: (data: string) => void }) {
  return (
    <Camera flex={1} barcodes={['qr', 'ean13']} onBarcode={(event) => props.found(event.data)} />
  );
}
```

## Différences entre plateformes

|              | iOS                       | Android                     |
| ------------ | ------------------------- | --------------------------- |
| Caméra       | AVFoundation              | CameraX                     |
| Codes-barres | `AVCaptureMetadataOutput` | ML Kit, embarqué dans l'app |

Le Simulateur iOS n'a pas de caméra : la vue rapporte `ERR_CAMERA_UNAVAILABLE`, donc testez les photos, l'enregistrement et les codes-barres sur un appareil. Les photos de la caméra frontale ne sont inversées sur aucune des deux plateformes, alors que l'aperçu l'est. Sur iOS, le zoom s'arrête à 10×. Les deux plateformes rapportent un code UPC-A comme `ean13`, avec un zéro en tête dans ses données.

## Permissions et configuration

La vue demande `camera` la première fois qu'elle doit tourner, et un refus est un `onError` avec `ERR_PERMISSION`. Enregistrer avec le son demande `microphone` à `startRecording`. Demandez plus tôt avec `permissions.request('camera')` pour choisir quand l'invite s'affiche ([permissions](../../../../docs/permissions.md)). Les raisons qu'affiche iOS viennent de `kuito.config.ts` :

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

La caméra tourne tant que la vue est à l'écran, que l'app est au premier plan et que l'aperçu n'est pas en pause. Elle s'arrête sinon, pour qu'une autre app puisse l'utiliser. `onReady` se déclenche chaque fois qu'elle redémarre, et les appels faits avant sont rejetés avec `ERR_NOT_READY`.

## Accessibilité

L'aperçu n'a rien à lire. Donnez un titre clair au bouton qui prend la photo, et annoncez un code scanné sous forme de texte : un utilisateur de lecteur d'écran ne voit pas forcément l'aperçu.

## Voir aussi

- [Image](./image.md), pour afficher la photo
- [Video](./video.md), pour lire l'enregistrement
- [Permissions](../../../../docs/permissions.md)
- [Camera en profondeur](../../../../docs/camera.md)
