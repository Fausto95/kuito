# Photo upload

A photo from the camera or the library, stripped of its JPEG metadata, then uploaded with a progress value.

**Use it for**

- `takePicture({ bytes: true })` for the JPEG's bytes, or `mediaPicker.pick` for one from the library.
- Dropping the EXIF segment before the file leaves the phone.
- `fileSystem.upload` reporting bytes sent, and keeping the photo when the upload fails so the user can try again.

The whole screen is [demo/recipes/photo-upload.tsx](../../../../../demo/recipes/photo-upload.tsx).

## Clean a JPEG, then send it

A JPEG's metadata lives in an `APP1` segment. The screen copies every segment except that one and writes the result next to the original. A PNG has no such segment here, so it uploads as picked. The camera and the photo library need `permissions.camera` and `permissions.photos` in `kuito.config.ts`.

```tsx
import { Button, Camera, VStack, cameraRef, fileSystem, mediaPicker, signal } from 'kuito';

const UPLOAD_URL = 'https://httpbin.org/post';

export default function PhotoUpload() {
  const camera = cameraRef();
  const progress = signal<number | null>(null);

  async function takeAndSend() {
    const picture = await camera.current?.takePicture({ quality: 0.8, bytes: true });

    if (!picture?.bytes) return;

    const uri = picture.uri.replace(/\.\w+$/, '-clean.jpg');

    await fileSystem.write(uri, picture.bytes);
    progress.value = 0;

    try {
      await fileSystem.upload(UPLOAD_URL, uri, {
        mimeType: 'image/jpeg',
        onProgress: ({ bytes, total }) => (progress.value = total ? bytes / total : 0),
      });
    } finally {
      progress.value = null;
    }
  }

  async function choose() {
    await mediaPicker.pick({ maxWidth: 2048, quality: 0.8 });
  }

  return (
    <VStack flex={1}>
      <Camera ref={camera} flex={1} />
      <Button onPress={() => void takeAndSend()}>Take photo</Button>
      <Button onPress={() => void choose()}>Choose from library</Button>
    </VStack>
  );
}
```

## Related

- [Camera](../../components/camera.md): `takePicture` and `bytes`
- [Permissions](../../../../../docs/permissions.md): declaring camera and photos
