# Pick and upload a photo

Use the system picker when the user should choose an existing photo. Upload its local URI directly and display progress and errors. The system photo picker does not require broad photo-library permission.

## Choose a file and send it

```tsx
import { Button, Text, VStack, fileSystem, mediaPicker, signal, task } from 'kuito';

export default function PhotoUpload() {
  const progress = signal(0);
  const selected = signal<string | null>(null);
  const upload = task(
    async () => {
      if (!selected.value) {
        const result = await mediaPicker.pick({
          mediaTypes: ['images'],
          maxWidth: 2048,
          quality: 0.8,
        });
        if (result.canceled || !result.assets[0]) return;
        selected.value = result.assets[0].uri;
      }
      progress.value = 0;
      const result = await fileSystem.upload('https://example.com/photos', selected.value, {
        onProgress: ({ bytes, total }) => {
          progress.value = total ? bytes / total : 0;
        },
      });
      if (result.status < 200 || result.status >= 300)
        throw new Error(`Upload failed: ${result.status}`);
      selected.value = null;
    },
    { policy: 'drop' },
  );

  return (
    <VStack padding={24} gap={12}>
      <Button disabled={upload.running.value} onPress={() => void upload.run().catch(() => {})}>
        {selected.value ? 'Retry upload' : 'Choose photo'}
      </Button>
      <Text>
        {upload.running.value
          ? `${Math.round(progress.value * 100)}%`
          : upload.error.value
            ? String(upload.error.value)
            : ''}
      </Text>
    </VStack>
  );
}
```

Replace the URL and configure upload fields/headers for your server. The selected URI remains available after failure so retry does not reopen the picker. This example does not strip metadata; if that is required, sanitize the image explicitly before upload.

For capture, use [Camera](camera.md) with camera permission or `mediaPicker.capture`. See [files](file-system.md) for upload options and [image picker](image-picker.md) for selection limits.
