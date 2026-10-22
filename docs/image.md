# Image

Display a bundled, remote or local-file image. Use it for avatars, covers and photos returned by the picker or camera.

## Load a cover without a blank flash

```tsx
import { Image } from 'kuito';

export default function Cover() {
  return (
    <Image
      src="https://example.com/cover.jpg"
      width={160}
      aspectRatio={1}
      borderRadius={8}
      placeholder="#1e293b"
      fadeDuration={250}
    />
  );
}
```

## Behavior

Give the image dimensions or an aspect ratio so layout can reserve space before download. `placeholder` fills the waiting area and `fadeDuration` controls its reveal. Remote images use native caching; `image.prefetch` warms the cache.

## Continue

Read [Assets](assets.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Image#members) for types and documented defaults.
