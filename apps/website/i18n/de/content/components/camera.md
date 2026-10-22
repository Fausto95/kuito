# Camera

`Camera` ist eine Live-Kameravorschau, die Bilder aufnimmt, Videos aufzeichnet und Barcodes scannt: AVFoundation auf iOS, CameraX auf Android. Sie wird wie jede View gelayoutet, und ihre Ref nimmt die Bilder auf.

Geeignet für:

- ein Profilfoto oder ein in der App aufgenommenes Dokument;
- einen kurzen Videoclip;
- das Scannen eines QR-Codes oder des Barcodes eines Tickets.

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

`cameraRef()` erzeugt eine Ref, die auch den Zustand der Kamera als Signale hält: `ready`, wahr ab dem ersten `onReady` bis zu einem Fehler, und `error`, das letzte `{ code, message }`, mit dem sie fehlgeschlagen ist. Ein Aufruf, während die Kamera gestoppt ist (pausiert, außerhalb des Bildschirms, im Hintergrund), wird mit `ERR_NOT_READY` abgelehnt, die Ablehnung also wie im Beispiel behandeln. `cameraRef()` wird aufgerufen, während eine Komponente eingerichtet wird, wie `ref()`. `takePicture` wird mit einem aufrechten JPEG im Cache-Verzeichnis aufgelöst, einer `file://`-URI, die `Image` und `fileSystem` lesen.

## Muster

### Die Bytes des Bildes lesen

`bytes: true` liefert zusätzlich die Bytes des JPEGs als `ArrayBuffer`, bereit zum Hochladen.

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

### Ein Video aufzeichnen

`startRecording` braucht `mode="video"`, nimmt `{ maxDuration }` in Sekunden an und wird mit `{ uri, duration }` aufgelöst, sobald die Aufzeichnung endet, was auch immer sie beendet: `stopRecording`, `maxDuration`, das Verlassen des Vordergrunds durch die App oder das Unmounten der View. `mute` zeichnet ohne Ton auf, und ohne nach dem Mikrofon zu fragen.

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

### Einen QR-Code scannen

`barcodes` sucht nach den angegebenen Formaten, solange die Vorschau läuft. `onBarcode` feuert einmal pro Code, sobald er ins Bild kommt, mit seinem `format`, seinen `data` und seinen `bounds` in Punkten der View.

```tsx
import { Camera } from 'kuito';

export default function Scanner(props: { found: (data: string) => void }) {
  return (
    <Camera flex={1} barcodes={['qr', 'ean13']} onBarcode={(event) => props.found(event.data)} />
  );
}
```

## Plattformunterschiede

|          | iOS                       | Android                      |
| -------- | ------------------------- | ---------------------------- |
| Kamera   | AVFoundation              | CameraX                      |
| Barcodes | `AVCaptureMetadataOutput` | ML Kit, in der App gebündelt |

Der iOS-Simulator hat keine Kamera: Die View meldet `ERR_CAMERA_UNAVAILABLE`, Bilder, Aufzeichnung und Barcodes also auf einem Gerät testen. Bilder der Frontkamera werden auf keiner der beiden Plattformen gespiegelt, die Vorschau dagegen schon. Auf iOS endet der Zoom bei 10×. Beide melden einen UPC-A-Code als `ean13`, seine Daten mit einer führenden Null.

## Berechtigungen und Konfiguration

Die View fragt nach `camera`, wenn sie zum ersten Mal laufen soll; eine Ablehnung ist ein `onError` mit `ERR_PERMISSION`. Aufzeichnen mit Ton fragt bei `startRecording` nach `microphone`. Früher mit `permissions.request('camera')` fragen, um zu wählen, wann der Dialog erscheint ([Berechtigungen](../../../../docs/permissions.md)). Die Begründungen, die iOS anzeigt, kommen aus `kuito.config.ts`:

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

Die Kamera läuft, solange die View auf dem Bildschirm ist, die App im Vordergrund ist und die Vorschau nicht pausiert ist. Andernfalls stoppt sie, damit eine andere App sie nutzen kann. `onReady` feuert jedes Mal, wenn sie wieder startet; Aufrufe davor werden mit `ERR_NOT_READY` abgelehnt.

## Barrierefreiheit

Die Vorschau hat nichts vorzulesen. Dem Button, der das Bild aufnimmt, einen klaren Titel geben und einen gescannten Code als Text ansagen: Wer einen Screenreader nutzt, sieht die Vorschau womöglich nicht.

## Siehe auch

- [Image](./image.md), um das Bild anzuzeigen
- [Video](./video.md), um die Aufzeichnung abzuspielen
- [Berechtigungen](../../../../docs/permissions.md)
- [Camera im Detail](../../../../docs/camera.md)
