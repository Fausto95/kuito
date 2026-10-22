# Over-the-air updates

A release build can take newer bytecode of its own app without a store release: `kuito update build` compiles and signs it, you upload it to any static https host, and the shell verifies it and runs it from its next start.

**Use it for**

- Shipping a fix to TypeScript or CSS without waiting for store review.
- Serving each store build the updates made for it, from one host.
- Rolling a bad update back on its own.

Only the bytecode changes. Native code, a native module, a permission, an image or a font needs a new store build.

## Set up

Make the key pair once, outside the app's directory:

```sh
kuito update key ~/keys/myapp-updates.pem
```

It writes the private key and prints the public key. Put the public key, and the URL the updates will be served from, in `kuito.config.ts`:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  updates: {
    url: 'https://updates.example.com/myapp',
    publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE…',
  },
} satisfies KuitoConfig;
```

The next `kuito build --profile release` embeds both in the shell. A build without `updates`, and every debug build, takes no update. An environment may set its own `updates`, such as a staging URL.

The private key signs every update the shells will run: it never goes in the app or the repository, and `kuito update` refuses one inside the app. In CI, keep its PEM in a secret.

## Publish an update

```sh
KUITO_UPDATE_KEY_PATH=~/keys/myapp-updates.pem kuito update build ios
```

`KUITO_UPDATE_KEY` takes the PEM itself instead. The command writes under `.kuito/updates/` (`--out <dir>` for elsewhere), for `production` unless `--env` names another:

```text
.kuito/updates/
  ios/<fingerprint>/
    update.json     the signed manifest a shell fetches
    <id>/*.hbc      the kernels and the app
    <id>/modules/   the app's chunks
```

Upload the directory's contents as they are to `updates.url`, the `<id>/` files before `update.json`. Keep `.kuito/sourcemaps/<platform>/update-<id>/` for every update you publish: [crash reports](./crash-reports.md) from it resolve with those maps.

## Which builds take which update

An update fits the shell it was built for, by a fingerprint of everything native the bytecode calls: the framework's native code and Hermes, the linked modules, the permissions and entries, the images, the fonts and the database migrations. The version, the build number, the name, the icon and the launch screen are left out, so a store build that changes only those keeps taking the same updates. Shells with another fingerprint read their own directory, so one host serves every store build at once.

## On the device

- After the first frame, the shell fetches its `update.json` in the background, verifies the signature, downloads the scripts and checks each one's size and SHA-256. The running app never changes: the update runs from the next start.
- A shell takes only an update newer than the code it runs, so an old update served again is refused.
- Two launches in a row that crash or never draw a frame roll the update back to the shell's own bytecode, and that update is refused from then on.
- Refusals and failures go to the system log: `[Kuito] Refused an update: …` on iOS, `Refused an update: …` under the tag `Kuito` on Android.

## Not covered yet

- The app's code cannot see or trigger updates: there is no API to check now, restart, or read the running update.
- A native crash after the first frame does not count against an update.
- A rollback goes to the embedded bytecode, not to the update before.
- No key rotation: a shell trusts the one public key it was built with.

## Related

- [Release builds and signing](./release-builds.md)
- [Crash reports](./crash-reports.md): reports that name the update a launch ran
- [Updates in depth](../../../../docs/updates.md): the manifest format, the launch sequence, the threat model
