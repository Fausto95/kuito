# Release builds and signing

`kuito build ios|android --profile release` builds the app as it ships: an `.ipa` for App Store Connect and an `.aab` for Google Play, signed with your credentials, or the same release app for one device.

**Use it for**

- Uploading a build to the App Store or Google Play.
- Installing the real release app on a phone, to try or to measure it.
- Signing in CI without an Apple account or a keystore password in a file.

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  ios: { bundleIdentifier: 'com.example.myapp', teamId: 'A1B2C3D4E5' },
  android: {
    applicationId: 'com.example.myapp',
    signing: { keystore: '../keys/upload.jks', keyAlias: 'upload' },
  },
} satisfies KuitoConfig;
```

```sh
kuito build ios --profile release
KUITO_ANDROID_KEYSTORE_PASSWORD=… KUITO_ANDROID_KEY_PASSWORD=… kuito build android --profile release
```

`kuito build` prints where the artifact is; it installs nothing. Raise `buildNumber` for every upload: the stores order builds by it, and crash reports find their source maps by it.

## What you get

| Build                | iOS                                                             | Android                                                           |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| For the store        | `.kuito/build/ios/export/KuitoIOS.ipa`                          | `.kuito/android/build/app/outputs/bundle/release/app-release.aab` |
| `--device <phone>`   | `.kuito/build/ios/Build/Products/Release-iphoneos/KuitoIOS.app` | `.kuito/android/build/app/outputs/apk/release/app-release.apk`    |
| `--device <virtual>` | `Release-iphonesimulator/KuitoIOS.app`, signed ad hoc           | The same APK                                                      |

`--device` takes a name or UDID from `kuito devices`. On a phone, install with `xcrun devicectl device install app --device <UDID> <app>` or `adb install`. There is no upload command yet: upload the `.ipa` with Xcode's Organizer or Transporter, and the `.aab` in the Play Console.

## How a release build differs

- The app ships as optimized Hermes bytecode only, with a minified kernel.
- No dev server connection, inspector, devtools or LogBox: console output goes to the system log (Xcode's console or Console.app, logcat with the tag `Kuito`).
- Errors and crashes are recorded as [crash reports](./crash-reports.md), and the source maps that resolve them stay in `.kuito/sourcemaps/`, never in the app.
- `--env <name>` picks an environment; `kuito build` builds `production` by default.

## Sign for iOS

Phone and store builds use automatic signing with the team `ios.teamId` names: the 10-character ID under Xcode › Settings › Accounts. Xcode may create the certificates and profiles it needs. Simulator builds need no team.

On a machine with no Apple account signed in to Xcode, such as CI, an App Store Connect API key signs instead. Set all three variables, or none:

```sh
export KUITO_APP_STORE_CONNECT_KEY_PATH=~/keys/AuthKey_ABC123.p8
export KUITO_APP_STORE_CONNECT_KEY_ID=ABC123
export KUITO_APP_STORE_CONNECT_ISSUER_ID=00000000-0000-0000-0000-000000000000
kuito build ios --profile release
```

## Sign for Android

Release builds sign with your upload key. Name its keystore and alias in `kuito.config.ts`, or in `KUITO_ANDROID_KEYSTORE` and `KUITO_ANDROID_KEY_ALIAS`, which win. The passwords come from the environment only, as `KUITO_ANDROID_KEYSTORE_PASSWORD` and `KUITO_ANDROID_KEY_PASSWORD`, which Gradle reads there itself, so they never appear in a config file or on a command line.

A store build without an upload key fails before Gradle runs. A release APK for a device falls back to the debug keystore when no key is named. Keep the keystore out of the repository.

## Related

- [Over-the-air updates](./updates.md): new bytecode without a store release
- [Crash reports](./crash-reports.md): what a release build records, and `kuito symbolicate`
- [App projects](./apps.md): `version`, `buildNumber` and environments
- [CLI](../../../../docs/cli.md#release-builds): every flag, and what each profile compiles
