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

## Props

<!-- Image props: generated from src/protocol/manifest.ts -->

| Prop                        | Meaning                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src`                       | A URL string, `{ uri, headers? }`, or an imported image ([assets](assets.md)).                                         |
| `objectFit`                 | CSS's `object-fit`: `cover` (default), `contain`, `fill` or `none`.                                                    |
| `tintColor`                 | Recolors opaque pixels, for icons.                                                                                     |
| `onLoadStart` / `onLoadEnd` | Around every load, success or failure.                                                                                 |
| `onLoad`                    | `{ width, height }` of the image in pixels.                                                                            |
| `onError`                   | `{ error }`, e.g. `"HTTP 404"`.                                                                                        |
| `aspectRatio` _(Kuito)_     | Width ÷ height: sizes the view before the image arrives.                                                               |
| `placeholder` _(Kuito)_     | Color shown while loading.                                                                                             |
| `thumbhash` _(Kuito)_       | A base64 [ThumbHash](https://evanw.github.io/thumbhash/): its blurred preview shows while loading, over `placeholder`. |
| `fadeDuration` _(Kuito)_    | Cross-fade in milliseconds when the image appears; 0 by default.                                                       |
| `cache` _(Kuito)_           | `memory-disk` (default), `memory`, `disk` or `none`.                                                                   |

<!-- end of generated props -->

## Continue

Read [Assets](assets.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Image#members) for types and documented defaults.
