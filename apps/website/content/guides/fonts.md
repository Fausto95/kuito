# Fonts

`fontFamily` names a system family, a font the app bundles, or one it loads at run time. `fontWeight` and `fontStyle` pick among the family's files the way CSS does. A family that is none of these is an error naming it, never a silent fallback to the system font.

```tsx
import { Text, VStack } from 'kuito';

export function Titles() {
  return (
    <VStack>
      <Text fontFamily="Pacifico">Bundled</Text>
      <Text fontFamily="Lato" fontWeight="bold">
        Loaded at run time
      </Text>
    </VStack>
  );
}
```

## Bundle fonts

List .ttf and .otf files under `fonts` in `kuito.config.ts`, relative to it:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
} satisfies KuitoConfig;
```

Each file's family, weight and style come from the file itself. So `Lato-Regular.ttf` and `Lato-Bold.ttf` are both `Lato`, at 400 and 700, and `fontFamily: 'Lato'` with `fontWeight: 'bold'` draws the bold file. An object sets any of `family`, `weight` (`normal`, `bold` or `100`-`900`) and `style` (`normal` or `italic`) instead.

An environment's `fonts` replaces the whole list. The CLI checks every environment's list: a path that isn't .ttf or .otf, two files with one name, a `.ttc` collection, and two files of the same family, weight and style each fail naming the key.

## Load fonts at run time

`fonts.load` registers font files the app has on disk, typically ones it downloaded with [fileSystem](../../../../docs/file-system.md). Each key is the family `fontFamily` will use; a file without a weight or style is 400 and normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const LATO_REGULAR_URL = 'https://example.com/fonts/Lato-Regular.ttf';
const LATO_BOLD_URL = 'https://example.com/fonts/Lato-Bold.ttf';
const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

URIs must be `file://`; a remote URL, an empty family, an empty list, or a weight or style outside the ones above is a `TypeError`. A file the platform can't load rejects with `ERR_FONT`, a missing one with `ERR_NOT_FOUND`. A registration lasts until the app exits, through reloads. Loading a family's weight and style again replaces that face. Await `load` before rendering text in the family: until then the family is missing.

## How fontFamily resolves

For a bundled or loaded family, the face is chosen the way CSS Fonts 4 matches fonts:

1. Style: the faces of the requested `fontStyle`, or all of them if the family has none in that style. Nothing is slanted or emboldened synthetically.
2. Weight: the requested `fontWeight` if the family has it. Otherwise, for lighter weights, lighter faces first; for heavier weights, heavier faces first. So a family of 400 and 700 draws `fontWeight: 600` bold and `300` regular.

A family the registry doesn't have falls through to the system: any family or font name iOS knows (`Menlo`, `Georgia-Bold`), or a system family on Android (`serif`, `monospace`, `sans-serif-condensed`). Anything else fails at the prop:

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

Variable fonts draw their default instance; their axes aren't mapped to `fontWeight` yet.

## In depth

[Fonts](../../../../docs/fonts.md) covers how a file's face is read from its tables, where bundled files land in each shell, which thread `load` and `loaded` run on, and the full weight-matching order.
