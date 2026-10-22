# Bundle and load fonts

Use a custom font for branding or typography. Bundle fonts needed on the first screen; load optional fonts when their content is requested.

## Bundle fonts in the native app

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

## Use a font in a label

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

## Load an optional font

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

## Behavior and limits

Use `.ttf` or `.otf` assets. Configured fonts are packaged into both native shells and referenced through `fontFamily`. `fonts.load` is asynchronous; wait for it before relying on the face, and use `fonts.loaded` to avoid unnecessary work. Keep readable fallbacks and allow system font scaling for accessibility.

## Continue

Read [Assets](assets.md) for the related workflow. The API reference lists every method, option, event and return type.
