# Introduction

Kuito builds native iOS and Android apps from TypeScript. Components are TSX, styles are CSS, state is signals. The result is UIKit and Android Views: no webview, no React renderer.

> Kuito is experimental and not production-ready. APIs and generated projects change.

## A component

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

`count` is a signal. `<Text>` reads it, so a write updates that one native label; the component function never runs again.

## Requirements

- Node.js 22.18 or newer
- iOS: macOS, Xcode, XcodeGen
- Android: JDK 21, Android SDK and NDK, Gradle 8

## Create an app

```sh
npx kuito doctor
npx kuito create MyApp
cd MyApp
npx kuito dev ios                     # or: npx kuito dev android
```

`kuito doctor` reports what is missing. `kuito create` writes `./MyApp` and installs its one dependency. `kuito dev ios` boots a simulator, builds the native shell, installs the app and starts watching your files.

```text
MyApp/
  app/                file-based routes
    _layout.tsx       the tab bar
    (home)/index.tsx  the first screen
  assets/             icon.png, splash.png
  modules/            the app's own native modules
  tests/              tests `kuito test` runs
  kuito.config.ts     name, ids, icon, environments
```

Edit `app/(home)/index.tsx` and save: the running app updates in place and keeps its state. No native project is committed: the CLI generates the shells into `.kuito/` when it builds.

## How it works

- **Compiled.** TSX and CSS compile at build time; no CSS parser runs on the device.
- **On-device Hermes.** The app runs in the native process, next to the views it drives.
- **Real views.** What the screen shows is UIKit and Android views, laid out by one shared engine.
- **Web APIs.** `fetch`, `WebSocket`, `URL`, timers and `crypto`, backed by the platform.
- **Native modules.** Swift and Kotlin behind one TypeScript spec; `haptics`, `location` and `storage` are built this way.

[Architecture](./architecture.md) explains each part.

## Next

- [App projects](./guides/apps.md): layout, `kuito.config.ts`, environments
- [Primitives](./guides/primitives.md) and [Reactivity](./guides/reactivity.md)
- [Styles](./language/styles.md): the CSS Kuito compiles
- [CLI](../../../docs/cli.md): every command
