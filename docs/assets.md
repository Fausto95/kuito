# Display images and icons

Use bundled images for app artwork, remote images for server content, and Symbol for platform icons. Put files your app owns in its assets directory.

## Bundle an image

Import a local asset and pass it to Image. Keep the source asset in the project so the compiler can package it. Reserve layout dimensions before an image loads.

```tsx
import { HStack, Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

export function Header() {
  return (
    <HStack gap={8}>
      <Image src={cover} />
      <Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
    </HStack>
  );
}
```

## Bundle an SVG

An `.svg` import is an image like a PNG, kept sharp at every size it is shown
at. iOS draws the file itself. Android draws vectors only as VectorDrawables,
so the build converts each SVG and fails on what Android would draw
differently, naming the element:

- **Converted:** paths and the basic shapes, groups with their transforms,
  fills and strokes, solid colors with their opacity, and linear and radial
  gradients: in the shape's box or in user space, through `gradientTransform`
  and `href`, each stop's opacity folded in, `spreadMethod` included.
- **Not converted:** text, patterns, clip paths, masks, filters, embedded
  images and `<use>`; a radial gradient that is not a circle (a box that is not
  square, or a `gradientTransform` that stretches it) or has its own focal
  point. Simplify the file, or bundle a PNG or PDF instead.

An `.svg?drawing` import, the shapes of a [Drawing](drawing.md), draws solid
colors only: a gradient there is an error.

## Use a platform icon

Symbol uses platform artwork. Give meaningful icons a label; choose a bundled asset or Drawing when the shape must be identical across platforms.

```tsx
import { Symbol } from 'kuito';

export const ShareIcon = () => (
  <Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
);
```

## Load remote or captured images

Image also accepts a URL or a source object with a URI and optional request headers. Use placeholder and fadeDuration for loading transitions. image.prefetch prepares the native cache. Picker and Camera results can be passed by URI; cache files must be copied to documents if they need to persist.

## Continue

See [Image](image.md), [Drawing](drawing.md), [media picker](image-picker.md) and [fonts](fonts.md).
