# Create your first app

Build a small native screen, run it on a simulator, and edit it while it is running.
Kuito is experimental; this checkout is the supported starting point.

## Install the tools

Use Node.js 22.18 or newer. iOS development needs macOS, Xcode and XcodeGen.
Android development needs JDK 21, the Android SDK and NDK, and Gradle 8.

From a checkout of this repository:

```sh
npm ci
node scripts/kuito.ts doctor
node scripts/kuito.ts create MyApp
cd MyApp
npx kuito dev ios
```

Use `npx kuito dev android` for Android. The first build downloads the pinned
native dependencies and generates a native project. `doctor` reports missing
tools; `npx kuito devices` lists available targets.

The generated app depends on this local checkout. Keep it available while
developing the app. After a release is published, running `npx kuito create MyApp` makes the app
depend on that release instead. The checkout flow above uses the current development source.

## Replace the home screen

Put this in `app/(home)/index.tsx`:

```tsx
import { Button, SafeArea, Text, signal } from 'kuito';

export default function PackingList() {
  const packed = signal(0);

  return (
    <SafeArea padding={24} gap={16}>
      <Text fontSize={28} fontWeight="bold">
        Ready to travel?
      </Text>
      <Text>{`${packed.value} items packed`}</Text>
      <Button onPress={() => packed.value++}>Pack an item</Button>
      <Button disabled={packed.value === 0} onPress={() => (packed.value = 0)}>
        Start over
      </Button>
    </SafeArea>
  );
}
```

Tap **Pack an item**: the label updates and **Start over** becomes enabled.
Change the heading and save. Live Patch updates the running app while keeping
compatible state, including the count. Component functions set up once;
expressions inside JSX track the signals they read.

## Know where files belong

| Path              | Put here                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `app/`            | Screens; each route file exports a component                      |
| `app/_layout.tsx` | Tab definitions and routing options                               |
| `assets/`         | Images, fonts, app icon and splash artwork                        |
| `modules/`        | App-specific Swift and Kotlin modules                             |
| `tests/`          | Tests run by `npx kuito test`                                     |
| `kuito.config.ts` | App identity and native settings                                  |
| `.kuito/`         | Generated native projects and build caches; do not edit or commit |

## Configure the app

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Packing List',
  version: '1.0.0',
  buildNumber: 1,
  ios: { bundleIdentifier: 'com.example.packing' },
  android: { applicationId: 'com.example.packing' },
  environments: {
    staging: { name: 'Packing List Staging', idSuffix: '.staging' },
  },
} satisfies KuitoConfig;
```

Run `npx kuito dev ios --env staging` to install the staging app alongside the
default app. Configuration is checked before generating the shells. Keep native
changes in this file or a module: generated projects are replaced on a build.
See [configuration](https://kuito.dev/docs/apis/config.KuitoConfig) for every key.

## Continue

- [Build a screen](primitives.md): layout, text and actions.
- [State and derived values](reactivity.md): signals, stores and shared state.
- [Navigation](navigation.md): routes, tabs and presented screens.
- [CLI](cli.md): devices, builds and troubleshooting.
