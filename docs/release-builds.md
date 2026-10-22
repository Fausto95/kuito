# Build and sign a release

Use `kuito build <platform> --profile release` to produce a signed store artifact. Use `--device` when testing a release build on a specific phone or simulator.

## Set the app identity

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

Choose your own package identifiers, team ID and key paths. Raise `buildNumber` for every upload and retain that build's source maps. Version is the user-facing version; build number identifies the exact uploaded build.

## Build for a store

```sh
kuito build ios --profile release
KUITO_ANDROID_KEYSTORE_PASSWORD=… KUITO_ANDROID_KEY_PASSWORD=… kuito build android --profile release
```

Supply real signing secrets through your environment or CI secret store. The command prints the artifact path and does not install or upload it.

| Target         | Output                                                            |
| -------------- | ----------------------------------------------------------------- |
| iOS store      | `.kuito/build/ios/export/KuitoIOS.ipa`                            |
| Android store  | `.kuito/android/build/app/outputs/bundle/release/app-release.aab` |
| iOS device     | `.kuito/build/ios/Build/Products/Release-iphoneos/KuitoIOS.app`   |
| Android device | `.kuito/android/build/app/outputs/apk/release/app-release.apk`    |

Upload the IPA with Xcode Organizer or Transporter and the AAB through Play Console. There is no Kuito store-upload command. `--env` selects app configuration; build defaults to production.

## Sign iOS builds

Set `ios.teamId` to your 10-character Apple development team ID. Automatic signing uses Xcode's account to obtain certificates and profiles. Simulator builds require no team.

For CI without an Xcode account, provide all three App Store Connect variables:

```sh
export KUITO_APP_STORE_CONNECT_KEY_PATH=~/keys/AuthKey_ABC123.p8
export KUITO_APP_STORE_CONNECT_KEY_ID=ABC123
export KUITO_APP_STORE_CONNECT_ISSUER_ID=00000000-0000-0000-0000-000000000000
kuito build ios --profile release
```

## Sign Android builds

Set the keystore and alias in config, or override them with `KUITO_ANDROID_KEYSTORE` and `KUITO_ANDROID_KEY_ALIAS`. Passwords come only from `KUITO_ANDROID_KEYSTORE_PASSWORD` and `KUITO_ANDROID_KEY_PASSWORD`. Keep the keystore outside version control.

A store build requires an upload key. A release APK for `--device` can fall back to the debug keystore when no key is configured; that fallback is useful for local testing, not store distribution.

## Test the release behavior

```sh
kuito devices
kuito build ios --profile release --device "My iPhone"
kuito build android --profile release --device DEVICE_SERIAL
```

Install the resulting app with platform tools (`xcrun devicectl device install app` or `adb install`). A release contains optimized Hermes bytecode and no dev connection, inspector or LogBox. Logs go to the platform log; failures use [crash reports](crash-reports.md). Test startup, permissions, offline behavior and the flows changed since the last release.

See [updates](updates.md) for compatible bytecode fixes after shipping.
