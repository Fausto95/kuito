# Image

`Image` shows an image from a URL (`https`, `file` or `data:`) or bundled with the app. It decodes off the main thread at the size it is shown, caches in memory and on disk, and loads each URL once however many views show it.

Use it for:

- album covers, avatars and photos from a server;
- icons and illustrations bundled with the app;
- a picture the user just took or picked, from its `file://` URI.

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

An Image of a URL has no size of its own until it loads: give it `width` and `height`, stretch it in a stack, or set `aspectRatio`.

## Patterns

### Show an image bundled with the app

An imported image is bundled into both shells when the app compiles, with its `@2x` and `@3x` siblings. Its size is known then, so it needs no size props ([assets](../guides/assets.md)).

```tsx
import { Image } from 'kuito';
import logo from './assets/logo.png';

export default function Logo() {
  return <Image src={logo} label="Kuito" />;
}
```

### Send headers with the request

```tsx
import { Image } from 'kuito';

export default function Avatar(props: { token: string }) {
  return (
    <Image
      src={{
        uri: 'https://example.com/me/avatar.jpg',
        headers: { Authorization: `Bearer ${props.token}` },
      }}
      width={48}
      height={48}
      borderRadius={24}
    />
  );
}
```

Both caches key an image by URL alone, so a refreshed token still finds it.

### Show a preview while it loads

`thumbhash` takes the base64 [ThumbHash](https://evanw.github.io/thumbhash/) a server makes from the full image; its blurred preview shows over `placeholder` until the image arrives.

```tsx
import { Image } from 'kuito';

export default function Photo() {
  return (
    <Image
      src="https://example.com/photo.jpg"
      aspectRatio={1.5}
      thumbhash="1QcSHQRnh493V4dIh4eXh1h4kJUI"
      onError={(event) => console.log(event.error)}
    />
  );
}
```

### Load an image before it shows

`image.prefetch` fills the caches and resolves with the image's size in pixels.

```tsx
import { image } from 'kuito';

export async function warm(uri: string) {
  const { width, height } = await image.prefetch(uri);

  return width / height;
}
```

## Platform differences

|              | iOS                | Android               |
| ------------ | ------------------ | --------------------- |
| Decoding     | ImageIO thumbnails | `inSampleSize`        |
| Memory cache | 64 MB              | An eighth of the heap |

## Accessibility

Tests find an Image by the `img` role. For a screen reader on a device, give an image that means something `accessible`, `role="img"` and a `label`; one that only decorates needs nothing.

## Related

- [Assets](../guides/assets.md)
- [Symbol](./symbol.md), the platform's icons by name
- [Image in depth](../../../../docs/primitives.md#image)
