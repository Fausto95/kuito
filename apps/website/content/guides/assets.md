# Assets and symbols

Images that ship with the app are imported, not loaded by URL: the compiler bundles each one into both shells and turns the import into a source whose size it already knows. The platforms' own symbols are a primitive, `<Symbol>`, checked by name when the app compiles.

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

## Bundled images

`import cover from './cover.png'` makes `cover` a `BundledImageSource`, `{ asset, width, height }`, which `<Image src>` takes like a URL. Apps type the import through `kuito/src/ui/assets.d.ts`, which a new app's `tsconfig.json` includes.

| File           | iOS                               | Android                                    |
| -------------- | --------------------------------- | ------------------------------------------ |
| `.png`, `.jpg` | an image set of its scales        | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`       |
| `.svg`         | the SVG, drawn as a vector        | a VectorDrawable, converted when it builds |
| `.pdf`         | the PDF's first page, as a vector | its first page, drawn by `PdfRenderer`     |

- **Scales.** `cover@2x.png` and `cover@3x.png` beside `cover.png` are the same image at 2x and 3x; each platform picks the one for the screen.
- **Size.** The compiler reads the size in points from the file. An Image of a bundled source with no `width`, `height` or class sizing it is that size; given one side, it keeps the image's aspect ratio. A size the app gives always wins.
- **Missing files.** An import of an image that does not exist, at any scale, is a compile error at the import: renaming an image breaks the build where it is used, not on a device.

## Vectors

iOS keeps SVG and PDF as vectors, so they stay sharp at any size. Android draws vectors in its own XML format, which covers what icons are made of: paths, rectangles, circles, ellipses, lines, polylines and polygons; groups with `translate`, `scale`, `rotate` and unskewed `matrix` transforms; solid fills and strokes. Anything else (text, gradients, `<style>` sheets, clip paths, masks, filters, embedded images, `<use>`) fails the Android build naming the element; bundle a PNG or PDF of it instead.

## Symbols

`<Symbol>` draws the platform's own symbol: an [SF Symbol](https://developer.apple.com/sf-symbols/) on iOS, a [Material Symbol](https://fonts.google.com/icons) on Android, the way tab icons are ([navigation](../../../../docs/navigation.md#icons)).

| Prop        | Meaning                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `name`      | A name both platforms have, as `"star"`, or `{ ios, android }`, as most differ.                     |
| `size`      | Point size; 24 by default. The view is a square of it unless the app sizes it.                      |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (default), `medium`, `semibold`, `bold`, `heavy`, `black`. |
| `tintColor` | The symbol's color; black by default, as Text is.                                                   |

```tsx
import { Symbol } from 'kuito';

export const ShareIcon = () => (
  <Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
);
```

A literal name a platform lacks fails the compile at its line, for `<Symbol name>` and `<Tab icon>` alike. A name computed at run time is checked by the renderer instead, which reports a name it lacks as an invalid prop. Android's Material Symbols font has one weight, so `medium` and heavier embolden the outline and lighter weights draw regular; iOS draws each SF Symbols weight.

## In depth

[Assets and symbols](../../../../docs/assets.md) covers how the shells name images, how the compiler reads each file's size, Live Patch of edited images, and where the symbol names it checks come from.
