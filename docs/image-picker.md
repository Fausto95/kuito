# Pick or capture media

Use the system media picker when the user should select a photo or video. Use capture for the system camera UI; use Camera for an embedded preview you control.

## Pick an image and preview it

```tsx
import { Button, Image, VStack, mediaPicker, signal } from 'kuito';

export function Cover() {
  const photo = signal('');

  const choose = async () => {
    const result = await mediaPicker.pick({ selectionLimit: 0, maxWidth: 1600 });

    if (!result.canceled) photo.value = result.assets[0].uri;
  };

  return (
    <VStack>
      <Image src={{ uri: photo.value }} aspectRatio={1.5} />
      <Button onPress={choose}>Choose a photo</Button>
    </VStack>
  );
}
```

## Behavior and limits

Treat cancellation as an expected result before accessing assets. Returned media files are in the app cache. Copy them before depending on long-term persistence, or upload them with fileSystem. Choose image/video types, selection count and output dimensions to fit your use case. Declare permissions needed by the capture or library operation in config.

## Continue

Read [File system](file-system.md) for the related workflow. The API reference lists every method, option, event and return type.
