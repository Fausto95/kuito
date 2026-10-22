<p align="center"><img src="apps/website/public/kuito-mark.svg" alt="Kuito caracal" width="100" /></p>

# Kuito

Build native iOS and Android interfaces with TypeScript, TSX, signals and CSS. Kuito compiles reactive bindings to native view updates; app logic runs in Hermes, and motion and gestures can run on the UI thread.

Kuito is experimental and not production-ready. Use a checkout to try the current development version.

## Run your first app

Install Node.js 22.18 or newer. For iOS, use macOS with Xcode and XcodeGen. For Android, install JDK 21, the Android SDK/NDK and Gradle 8.

```sh
git clone https://github.com/Fausto95/kuito.git
cd kuito
npm ci
node scripts/kuito.ts doctor
node scripts/kuito.ts create MyApp
cd MyApp
npx kuito dev ios
```

Use `npx kuito dev android` for Android. The generated app depends on the checkout, so keep it available. [Create your first app](docs/apps.md) explains the files, app configuration and device setup.

## Write a screen

```tsx
import { Button, SafeArea, Text, signal } from 'kuito';

export default function Counter() {
  const count = signal(0);
  return (
    <SafeArea padding={24} gap={16}>
      <Text fontSize={28}>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Add one</Button>
    </SafeArea>
  );
}
```

A signal write updates the properties that read it. Component functions establish the screen and its resources; they do not rerun on every state change. Saving a compatible edit patches the running app while retaining state.

## Find the documentation

| Task                            | Start here                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Build and style a screen        | [Components](docs/primitives.md), [styles](docs/styles.md)                                                           |
| Manage state, load or save data | [Signals](docs/reactivity.md), [async work](docs/async.md), [storage](docs/storage.md), [database](docs/database.md) |
| Navigate and animate            | [Navigation](docs/navigation.md), [motion](docs/motion.md)                                                           |
| Use platform features           | [Permissions](docs/permissions.md), [native modules](docs/native-modules.md)                                         |
| Test, debug and ship            | [Testing](docs/testing.md), [DevTools](docs/devtools.md), [release builds](docs/release-builds.md)                   |
| Browse everything               | [Documentation index](docs/README.md), [website](https://kuito.dev/docs)                                             |

The website renders these same guides alongside generated signatures, component props, CSS properties and CLI flags. Every public export has a checked example. Task examples live with their topic; the demo source remains available in [demo/](demo/).

## Work on the framework

```sh
npm test
npm run lint
npm run generate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development checks and [apps/website/README.md](apps/website/README.md) for the documentation pipeline. [Architecture](docs/architecture.md) maps the compiler, runtimes and platform code.

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

## License

[MIT](LICENSE). Ported and bundled third-party code retains its own license; see the credits above and the notices shipped beside that code.
