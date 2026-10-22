# fonts

`fontFamily` names a system family, a font the app bundles, or one it loads
at run time. `fontWeight` and `fontStyle` pick among the family's files the
way CSS does. A family that is none of these is an error naming it, never a
silent fallback to the system font.

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
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
  environments: {
    staging: { fonts: ['./assets/fonts/Staging.ttf'] },
  },
} satisfies KuitoConfig;
```

Each file's family, weight and style come from the file itself: its
typographic family (name ID 16, else the family, ID 1), its OS/2 weight class
and OS/2's italic bit. So `Lato-Regular.ttf` and `Lato-Bold.ttf` are both
`Lato`, at 400 and 700, and `fontFamily: 'Lato'` with `fontWeight: 'bold'`
draws the bold file. An object sets any of `family`, `weight` (`normal`,
`bold` or `100`–`900`) and `style` (`normal` or `italic`) instead.

An environment's `fonts` replaces the whole list. The CLI checks every
environment's list: a path that isn't .ttf or .otf, a font key it doesn't
know, two files with one name, a file that isn't a single TrueType or
OpenType font (a `.ttc` collection is an error), and two files of the same
family, weight and style each fail naming the key.

On each build (`src/cli/fonts.ts`) the files and a manifest,
`fonts.json`, of the face each one is go into the shells:

- **iOS**: `.kuito/ios/fonts/`, a folder in the app bundle, with each file
  listed in `UIAppFonts` so iOS registers them at launch.
- **Android**: `.kuito/android/assets/fonts/`, loaded with
  `Typeface.createFromAsset`.

## Load fonts at run time

`fonts.load` registers font files the app has on disk, typically ones it
downloaded with [fileSystem](file-system.md). Each key is the family
`fontFamily` will use; a file without a weight or style is 400 and normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const LATO = 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/';
const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO + 'Lato-Regular.ttf', regular);
await fileSystem.download(LATO + 'Lato-Bold.ttf', bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

| Function         | Runs on                        | Notes                                                |
| ---------------- | ------------------------------ | ---------------------------------------------------- |
| `load(fonts)`    | the module's background thread | `{ Family: uri \| { uri, weight, style } \| [...] }` |
| `loaded(family)` | the JS thread, synchronously   | whether a bundled or loaded font has that family     |

URIs must be `file://`; a remote URL, an empty family, an empty list, or a
weight or style outside the ones above is a `TypeError` before anything
crosses. A file the platform can't load rejects with `ERR_FONT`, a missing
one with `ERR_NOT_FOUND`.

iOS registers each file for the process with
`CTFontManagerRegisterFontsForURL`; Android makes a `Typeface` with
`Typeface.createFromFile`. A registration lasts until the app exits, through
reloads. Loading a family's weight and style again replaces that face. Await
`load` before rendering text in the family: until then the family is
missing.

## How `fontFamily` resolves

Each renderer keeps one registry of families (`KuitoFonts` on both
platforms): the bundled manifest, read on first use, plus what `fonts.load`
added. For a family in it, the face is chosen the way CSS Fonts 4 matches
fonts:

1. **Style**: the faces of the requested `fontStyle`, or all of them if the
   family has none in that style. Nothing is slanted or emboldened
   synthetically.
2. **Weight**: the requested `fontWeight` if the family has it. Otherwise,
   for 400 and 500, heavier faces up to 500, then lighter, then heavier; for
   lighter weights, lighter faces first; for heavier weights, heavier faces
   first. So a family of 400 and 700 draws `fontWeight: 600` bold and
   `300` regular.

A family the registry doesn't have falls through to the system: any family
or font name iOS knows (`Menlo`, `Georgia-Bold`), or a system family on
Android (`serif`, `monospace`, `sans-serif-condensed`), weighted and slanted
by the system as before. Anything else fails at the prop:

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

Variable fonts draw their default instance; their axes aren't mapped to
`fontWeight` yet.
