<p align="center">
  <img src="apps/website/public/kuito-mark.svg" alt="Kuito caracal" width="100" />
</p>

<h1 align="center">Kuito</h1>

<p align="center">
  <strong>Native apps. Web simplicity.</strong><br />
  A TypeScript-first framework for building real iOS and Android interfaces without React's reconciler.
</p>

<p align="center">
  <a href="docs/">Documentation</a> ·
  <a href="demo/">Examples</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

> [!WARNING]
> **Kuito is an experimental proof of concept, not production-ready.** It does
> not claim to be faster than React Native yet.

## Why Kuito?

- **Real native views.** TSX components drive UIKit and Android Views through a C++ mutation queue.
- **Actual CSS files.** CSS classes, tokens, variants, transitions and native units compile at build time; no CSS parser runs on the device.
- **Familiar Web APIs.** Platform-backed `fetch`, WebSocket, AbortController, timers and the other documented standard APIs.
- **Fine-grained signals.** A change updates the native properties that read it, without rerunning the component.
- **Native motion.** Gestures and animations declared in TSX run on the UI thread.

## A component

```tsx
import { signal, VStack, Text, Button } from 'kuito';

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

## Get started

It needs Node.js 22.18+, and Xcode with XcodeGen for iOS or JDK 21, the
Android SDK/NDK and Gradle 8 for Android. `kuito doctor` checks them.

```sh
npx kuito create MyApp
cd MyApp
npx kuito dev ios        # or: npx kuito dev android
```

The starter has native tabs, a pushed screen per topic and a sheet, from
file-based routes. See [`kuito create`](docs/cli.md#create-an-app) and the
[CLI guide](docs/cli.md).

## Try the demo

[Reel](demo/app) is a streaming catalog over the public TVMaze API: live
`fetch`, cached posters in horizontal rails, debounced search, paged lists with
pull-to-refresh, a details sheet, animations, haptics and the LogBox.

From a clone of this repository:

```sh
npm install
npm run demo:ios        # iOS Simulator; macOS only
npm run demo:android    # Android emulator
```

See [the demo walkthrough](docs/showcase.md) for its screens and files.

## Stack

| Layer                    | Technology                                 |
| ------------------------ | ------------------------------------------ |
| App authoring            | TypeScript, TSX, supported CSS             |
| Compiler and bundler     | Oxc, Rolldown                              |
| JavaScript runtime       | Hermes V1, bytecode compiled at build time |
| Native host and renderer | C++, Swift (iOS), Kotlin (Android)         |
| UI platforms             | UIKit and Android Views                    |
| Native layout            | C++ port of Taffy's flexbox                |
| Website and docs         | TanStack Start, Cloudflare Workers         |

App logic runs on a dedicated Hermes thread; native mutations are committed on
the UI thread, and motion runs next to the views. See
[architecture](docs/architecture.md) and [capabilities](docs/capabilities.md).

## Tests

Vite+ (`vp`) runs tests (Vitest), lint (Oxlint) and formatting (Oxfmt).

```sh
npm test        # runtime, components, CLI, headless host
npm run lint    # Oxlint with type-aware rules; warnings fail
npm run fmt     # Oxfmt
```

Apps test their screens headlessly with `kuito/tests` ([testing](docs/testing.md)).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, testing and PR guidance.

## License

[MIT](LICENSE). Ported and bundled third-party code keeps its own license, listed below.

## Credits

- [Taffy](https://github.com/DioxusLabs/taffy), by Visly Inc. and the Taffy
  authors (MIT): the layout engine (`native/shared/layout`) is a C++ port of its
  flexbox algorithm, and its fixtures are the conformance suite
  (`native/shared/layout/LICENSE-taffy`).
- [Reanimated](https://github.com/software-mansion/react-native-reanimated), by
  Software Mansion (MIT): the model of props computed on the UI thread
  ([motion](docs/motion.md)).
- [React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler),
  by Software Mansion (MIT): ports of its native recognizers, its composition
  rules and event mapping (`native/LICENSE-react-native-gesture-handler`).
- [Octane](https://github.com/octanejs/octane), by Dominic Gannaway (MIT): how
  the compiler emits UI-thread functions.
- [Material Symbols](https://github.com/google/material-design-icons), by Google
  (Apache 2.0): Android's tab icons
  (`native/android/app/src/main/LICENSE-material-symbols`).
- [Hermes](https://hermesengine.dev/), [Oxc](https://oxc.rs/) and
  [Rolldown](https://rolldown.rs/): JavaScript execution, compiler and bundler.
- [react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash):
  the native splash-screen generation approach.
