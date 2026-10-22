# Run, test and build an app

Create an app with `npx @kuito/kuito`, then run `npx kuito` from the app directory
containing `kuito.config.ts`. App commands use the installed framework version.

## Create an app

```sh
npx @kuito/kuito create MyApp
cd MyApp
npx kuito doctor
npx kuito dev ios
```

The CLI creates the starter and installs the published package as the `kuito`
dependency. `npx @kuito/kuito create MyApp --no-install` skips installation;
run `npm install` inside the app before using it. `init` is an alias for `create`.
See [first app](apps.md) for requirements and the first screen.

## Choose a target and develop

```sh
npx kuito devices
npx kuito dev android
npx kuito dev ios --device "My iPhone"
npx kuito dev ios --env staging
```

dev builds, installs, launches and watches. run is an alias. Choose a name or
identifier reported by devices. `--entry` selects another entry file relative
to the app; `--port` changes the dev server port; `--no-launch` starts the patch
server without launching a native app. `--verbose` shows native build logs.

While dev runs, press r to reload, m for the native developer menu, j for JS
DevTools, u for UI-thread DevTools, and k for the Components panel. Save an edit
to apply a Live Patch. Native source or configuration changes need a rebuild.

## Test a screen

```sh
npx kuito test
npx kuito test android tests/sign-in.test.tsx
```

Tests run on the headless host. See [testing](testing.md) for component queries,
interactions, platform fakes and network responses.

## Add native functionality

```sh
npx kuito module create Battery
```

The command writes a module spec and platform sources under modules/. Implement
the generated contract, import the module and rebuild. See [native modules](native-modules.md).

## Build for release

```sh
npx kuito build ios --profile release
npx kuito build android --profile release
npx kuito build android --profile release --device "My Phone"
```

Without --device, release builds produce an iOS IPA or Android AAB. With a
device, they produce an installable release app. build prints the artifact
path and does not install or upload it. debug is the default profile. Use
[release builds](release-builds.md) for signing and environment settings.

## Build an update or inspect a crash

```sh
npx kuito update key ~/keys/myapp-updates.pem
npx kuito update build ios --out .kuito/publish
npx kuito symbolicate report.json
```

Configure the update public key and host before building an update, and supply
the signing key through the documented environment variable. Keep source maps
for each release and update. See [updates](updates.md) and [crash reports](crash-reports.md).

## Troubleshoot a target

```sh
npx kuito doctor --json
npx kuito devices --json
npx kuito logs android
npx kuito help
```

doctor checks tools but does not install SDKs. logs streams platform output.
If a physical iPhone cannot connect, verify pairing, signing and Developer
Mode, then launch through dev so the app receives its session connection.
Android physical devices use adb reverse. See [phone development](phone-live-patch.md).

The [command reference](https://kuito.dev/docs/cli/commands) and
[option reference](https://kuito.dev/docs/cli/options) list every parser-supported
command and flag. A flag is only valid for the commands named in its help.
