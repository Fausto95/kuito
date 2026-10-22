# Camera

`Camera` is a live camera preview that takes pictures, records videos and scans barcodes: AVFoundation on iOS, CameraX on Android. It lays out like any view, and its ref takes the pictures.

Use it for:

- a profile photo or a document taken in the app;
- a short video clip;
- scanning a QR code or a ticket's barcode.

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

`cameraRef()` makes a ref that also holds the camera's state as signals: `ready`, true from the first `onReady` until an error, and `error`, the last `{ code, message }` it failed with. A call while the camera is stopped (paused, off screen, in the background) rejects with `ERR_NOT_READY`, so handle the rejection as the example does. Call it while a component sets up, like `ref()`. `takePicture` resolves with an upright JPEG in the cache directory, a `file://` URI that `Image` and `fileSystem` read.

## Patterns

### Read the picture's bytes

`bytes: true` also returns the JPEG's bytes as an `ArrayBuffer`, ready to upload.

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

### Record a video

`startRecording` needs `mode="video"`, takes `{ maxDuration }` in seconds, and resolves with `{ uri, duration }` once the recording ends, whatever ends it: `stopRecording`, `maxDuration`, the app leaving the foreground, or the view unmounting. `mute` records without sound, and without asking for the microphone.

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

### Scan a QR code

`barcodes` scans for the formats given while the preview runs. `onBarcode` fires once per code as it comes into view, with its `format`, `data` and `bounds` in the view's points.

```tsx
import { Camera } from 'kuito';

export default function Scanner(props: { found: (data: string) => void }) {
  return (
    <Camera flex={1} barcodes={['qr', 'ean13']} onBarcode={(event) => props.found(event.data)} />
  );
}
```

## Platform differences

|          | iOS                       | Android                    |
| -------- | ------------------------- | -------------------------- |
| Camera   | AVFoundation              | CameraX                    |
| Barcodes | `AVCaptureMetadataOutput` | ML Kit, bundled in the app |

The iOS Simulator has no camera: the view reports `ERR_CAMERA_UNAVAILABLE`, so test pictures, recording and barcodes on a device. Front camera pictures aren't mirrored on either platform, though the preview is. On iOS zoom stops at 10×. Both report a UPC-A code as `ean13`, its data with a leading zero.

## Permissions and config

The view asks for `camera` the first time it should run; a denial is an `onError` with `ERR_PERMISSION`. Recording with sound asks for `microphone` at `startRecording`. Ask earlier with `permissions.request('camera')` to choose when the prompt shows ([permissions](../../../../docs/permissions.md)). The reasons iOS shows come from `kuito.config.ts`:

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

The camera runs while the view is on screen, the app is in the foreground and the preview isn't paused, and stops otherwise so another app can use it. `onReady` fires each time it starts again; calls before that reject with `ERR_NOT_READY`.

## Accessibility

The preview has nothing to read. Give the button that takes the picture a clear title, and announce a scanned code in text: a screen reader user may not see the preview.

## Related

- [Image](./image.md), to show the picture
- [Video](./video.md), to play the recording
- [Permissions](../../../../docs/permissions.md)
- [Camera in depth](../../../../docs/camera.md)
