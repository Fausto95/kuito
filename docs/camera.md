# Camera

Embed a live camera preview and capture photos or video. Use it for a scanner or a custom capture screen.

## Capture a photo and preview the result

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

## Behavior

Declare camera permission in config; recording with audio also needs microphone permission. Wait for `camera.ready` before calling methods. Captures return cache files, so copy a result to documents when it must persist. Test capture on a physical device.

## Continue

Read [Permissions](permissions.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Camera#members) for types and documented defaults.
