# Assets and symbols

Images that ship with the app are imported, not loaded by URL: the compiler
bundles each one into both shells and turns the import into a source whose
size it already knows. The platforms' own symbols are a primitive,
`<Symbol>`, checked by name when the app compiles.

```tsx
import { HStack, Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

export function Album() {
  return (
    <HStack>
      <Image src={cover} />
      <Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
    </HStack>
  );
}
```

## Bundled images

`import cover from './cover.png'` makes `cover` a `BundledImageSource`,
`{ asset, width, height }`, which `<Image src>` takes like a URL. Apps type
the import through `kuito/src/ui/assets.d.ts`, which a new app's
`tsconfig.json` includes.

| File           | iOS                               | Android                                    |
| -------------- | --------------------------------- | ------------------------------------------ |
| `.png`, `.jpg` | an image set of its scales        | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`       |
| `.svg`         | the SVG, drawn as a vector        | a VectorDrawable, converted when it builds |
| `.pdf`         | the PDF's first page, as a vector | its first page, drawn by `PdfRenderer`     |

- **Scales.** `cover@2x.png` and `cover@3x.png` beside `cover.png` are the
  same image at 2× and 3×; each platform picks the one for the screen. The
  import names the plain file, which may itself be missing.
- **Size.** The compiler reads the size in points from the file: a raster's
  pixels divided by its largest scale, an SVG's `width` and `height` (else its
  `viewBox`), a PDF's page. An Image of a bundled source with no `width`,
  `height` or class sizing it is that size; given one side, it keeps the
  image's aspect ratio. A size the app gives always wins.
- **Names.** Both shells know an image by its path from the app's root (the
  directory with `kuito.config.ts`), as an Android resource name:
  `assets/Cover Art.png` is `asset_assets_cover_art`. Two files that come to
  the same name are a compile error naming both.
- **Missing files.** An import of an image that does not exist, at any scale,
  is a compile error at the import, like any unresolved import: renaming an
  image breaks the build where it is used, not on a device.
- **Vectors.** iOS keeps SVG and PDF as vectors, so they stay sharp at any
  size. Android draws vectors in its own XML format, which covers what icons
  are made of: paths, rectangles, circles, ellipses, lines, polylines and
  polygons; groups with `translate`, `scale`, `rotate` and unskewed `matrix`
  transforms; solid fills and strokes with their opacity, caps, joins and
  `fill-rule`. Anything else (text, gradients, `<style>` sheets, clip paths,
  masks, filters, embedded images, `<use>`) fails the Android build naming the
  element; bundle a PNG or PDF of it instead. A PDF is redrawn at the size it
  appears on both platforms.
- **Drawings.** `import check from './check.svg?drawing'` reads the SVG into
  shapes a [Drawing](drawing.md#svg-files) draws, and bundles no image.

### Live Patch

An imported image is watched like a source file. Editing one recompiles the
app and sends the patch; `kuito dev` sees that the
running shell was built with other bytes, or without the image at all, and
says so in its feed (`Rebuilding the shell: the app now bundles
assets/cover.png`) as it rebuilds and relaunches, the way it does for a newly
required native module. Adding a `@2x` file beside an image is picked up on
the next edit of its importer.

On the device, an Image whose bundled name the shell lacks is an invalid prop
(`The app was built without the image …: build it again`), never a blank view.

## Symbols

`<Symbol>` draws the platform's own symbol: an
[SF Symbol](https://developer.apple.com/sf-symbols/) on iOS, a
[Material Symbol](https://fonts.google.com/icons) on Android, the way tab
icons are ([navigation](navigation.md#icons)).

| Prop        | Meaning                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `name`      | A name both platforms have, as `"star"`, or `{ ios, android }`, as most differ.                            |
| `size`      | Point size; 24 by default. The view is a square of it unless the app sizes it, and the symbol fits inside. |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (default), `medium`, `semibold`, `bold`, `heavy`, `black`.        |
| `tintColor` | The symbol's color; black by default, as Text is.                                                          |

```tsx
import { Symbol } from 'kuito';

export const ShareIcon = () => (
  <Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
);
```

A literal name a platform lacks fails the compile at its line, for `<Symbol
name>` and `<Tab icon>` alike:

```
app/home.tsx:12:20 <Symbol name="magnifyingglass">: no Material Symbol has that name (fonts.google.com/icons)
```

The compiler reads iOS's names from the SF Symbols the Mac lists, so an iOS
name is checked when the app compiles on a Mac (as an iOS build must), and
Android's from the Material Symbols font the Android shell draws with. A name
computed at run time is checked by the renderer instead, which reports a name
it lacks as an invalid prop.

Android's Material Symbols font has one weight, so `medium` and heavier
embolden the outline and lighter weights draw regular; iOS draws each SF
Symbols weight.
