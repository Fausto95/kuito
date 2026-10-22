# Over-the-air updates

A [release build](cli.md#release-builds) can take a newer version of its own
bytecode without a store release: `kuito update build` compiles the app and
signs it, you upload the result to a static host, and the shell checks it,
stages it and runs it from its next start. Only the bytecode changes. A
change to native code, a native module, a permission, an image or a font needs
a new store build, and the shell refuses an update made for one it is not
([compatibility](#compatibility)). Debug builds take [Live Patches](cli.md)
instead, never updates.

## Set up

Make the key pair once, outside the app:

```sh
kuito update key ~/keys/myapp-updates.pem
```

It writes the private key, readable by you only, and prints the public key.
Put the public key and where the updates will be in `kuito.config.ts`:

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'My App',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  updates: {
    url: 'https://updates.example.com/myapp',
    publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE…',
  },
} satisfies KuitoConfig;
```

`kuito build --profile release` then embeds both in the shell, with the
shell's [fingerprint](#compatibility) and the time it was built, in
`kuito-updates.json` (Resources on iOS, assets on Android). A build without
`updates`, and every debug build, carries no such file and takes no update.
An environment may set its own `updates`, like a staging URL.

The private key signs every update the shells will run: anyone who holds it
can ship code to every installed copy. It never goes in the app or the
repository, and `kuito update` refuses one inside the app's directory. Keep
it where you keep the upload keystore ([signing](cli.md#signing)); in CI, put
its PEM in a secret. Losing it strands every shell built with its public key:
they take updates signed with it only, until a store build with a new key
reaches them.

| Variable                | What                                         |
| ----------------------- | -------------------------------------------- |
| `KUITO_UPDATE_KEY_PATH` | The PEM file `kuito update key` wrote        |
| `KUITO_UPDATE_KEY`      | The PEM itself, for a CI secret; wins if set |

## Build and publish

```sh
KUITO_UPDATE_KEY_PATH=~/keys/myapp-updates.pem kuito update build ios
```

It compiles the app as a release build does, signs it and writes it under
`.kuito/updates/` (`--out <dir>` for elsewhere), for the `production`
environment unless `--env` names another:

```
.kuito/updates/
  ios/<fingerprint>/
    update.json            the signed manifest a shell fetches
    <id>/bootstrap.hbc     the kernel
    <id>/ui.hbc            the UI kernel, from the same build
    <id>/app.hbc           the app's root chunk
    <id>/app-ui.hbc        the app's UI bundle, which app.hbc names by hash
    <id>/modules/<chunk>.hbc
```

Upload the directory's contents as they are to `updates.url`: a shell fetches
`<url>/<platform>/<fingerprint>/update.json` and the files from beside it.
Any host that serves static files over https does; Kuito ships none, and
nothing in the request names the user or the device. Upload `<id>/` before
`update.json`, so no shell reads a manifest whose files are not there yet.
Shells with another fingerprint keep reading their own directory, so one host
serves every store build at once.

Before it writes anything, the command checks its signature with
`updates.publicKey`: an update the shells would refuse, signed with another
key, fails here instead. It keeps the update's source maps in
`.kuito/sourcemaps/<platform>/update-<id>/`, and a crash report from a
shell running it names the update, so `kuito symbolicate` resolves it with
them ([crash reports](crash-reports.md#symbolication)). Keep that directory
for every update you publish.

## Format

`update.json` is the manifest, as the string that was signed, and the
signature: ECDSA P-256 with SHA-256 over the manifest's UTF-8 bytes, DER, in
base64. The shells check it with the platform's own crypto (CryptoKit on iOS,
`java.security` on Android, which has had P-256 since before the oldest
Android Kuito runs on), and nothing in it needs to be re-encoded to verify.

```json
{
  "manifest": "{\"format\":1,\"id\":\"3f2a…\",\"app\":\"com.example.myapp\",…}",
  "signature": "MEUCIQ…"
}
```

The manifest, signed:

| Field         | What                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `format`      | `1`. A shell refuses another.                                                                                                    |
| `id`          | 16 hex digits of a hash of the files' paths and hashes: the same scripts are the same update.                                    |
| `app`         | The bundle id or `applicationId` the update is for.                                                                              |
| `url`         | The `updates.url` it is published on: a shell refuses one published for another host.                                            |
| `platform`    | `ios` or `android`.                                                                                                              |
| `fingerprint` | The shell it fits ([compatibility](#compatibility)).                                                                             |
| `createdAt`   | When it was signed, in milliseconds since 1970. A shell takes only an update newer than the code it runs.                        |
| `files`       | Each script's `path` (`bootstrap.hbc`, `ui.hbc`, `app.hbc`, `app-ui.hbc` or `modules/<chunk>.hbc`), `sha256` in hex, and `size`. |

## Compatibility

An update's bytecode calls into the shell: the kernel's wire format, the
native modules and the functions of the shell's link table, the images and
fonts it holds, its permissions and entries, the database migrations it runs,
and the Hermes that reads the bytecode. The shell's fingerprint is a SHA-256
of all of them as the CLI generates the shell: the framework's native code for
the platform (tests aside) and `native/hermes.json`, each linked module's
manifest and native code, the generated link table, the merged Info.plist and
entitlements or manifest entries, the imported images and bundled fonts, and
the migrations. The version, the build number, the app's name, its icon and
its launch screen are left out, so a store build that changes only those
keeps taking the same updates. Anything else makes a new fingerprint, and the
shells built before it refuse updates built after it: they need the new store
build first.

## On the device

A release shell with `kuito-updates.json` decides once, as it launches,
which bytecode it runs:

1. If the shell is another store build than the one the stored updates were
   for (another fingerprint or build time), it deletes them and starts from
   its own bytecode.
2. It counts the last launch against the update it ran when that launch
   crashed, as the [crash hook](crash-reports.md) recorded it, or never drew a
   first frame. Two in a row roll the update back: it is deleted and refused
   from then on, and the shell runs its embedded bytecode.
3. An update staged by an earlier launch replaces the one running.
4. It records that this launch runs that update, before reading it, so a
   crash while the update is read counts against it too.
5. The update is verified again from disk: its signature, its app, platform,
   host and fingerprint, and every script's size and hash. One that does not
   verify is deleted, and the embedded bytecode runs.

The choice holds for the process: a view controller or activity the system
makes again runs the same bytecode. A chunk the app loads later is read by
name from the same directory, and a name that is not one (`../x`) loads
nothing.

Once the app drew its first frame, the shell fetches
`<url>/<platform>/<fingerprint>/update.json` in the background. A 404 means
no update. Otherwise it verifies the envelope, refuses an update it rolled
back or one no newer than the newest it took (or than its embedded bytecode),
downloads each script, checks its size and SHA-256 before writing it, and
stages the update for the next start. The app keeps running what it started
with: nothing changes under a running app. Each refusal and failure goes to
the system log (`[Kuito] Refused an update: …`); none is a crash report.

The kernel, the app's root chunk and every chunk it loads later come from the
update's directory (Application Support on iOS, the app's files on Android);
images, fonts and everything else native stay the shell's own, which is what
the fingerprint is for. A crash report from a launch running an update names
it as `app.update`.

## Threat model

What the design defends against, and how:

| Threat                                                                       | Defense                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tampering**: a host, a CDN or the network changes a script or the manifest | The manifest is signed with a key the host never sees, and checked against the public key compiled into the shell. Every script is checked against the size and SHA-256 the manifest signed, when it is downloaded and again at each launch that runs it. A shell never runs a byte it did not verify. https is required too, but the signature is what is relied on.                            |
| **Replay**: an old, validly signed update served again                       | Every update carries `createdAt`, signed. A shell keeps the newest it took and refuses anything no newer, and an update it rolled back is refused by id. The manifest names the app, the platform, the host it was published on and the fingerprint, so an update signed for one app, platform, environment or store build cannot be served to another, even with one key for every environment. |
| **Downgrade**: serving an older update, to bring back a fixed bug            | Same as replay: the order is the signed `createdAt`, and the shell's own embedded bytecode counts as of its build time, so a store build never runs an update made before it.                                                                                                                                                                                                                    |
| **A bad update bricking the app**                                            | Updates apply only at the next start. A launch that crashes or never draws counts against the update; two in a row roll back to the embedded bytecode, which a store review shipped and which the update could not change. The update is then refused, so the next check cannot reinstall it. An update for native code the shell lacks is refused before it is downloaded.                      |
| **A stolen signing key**                                                     | Out of the shell's reach: whoever holds the key can sign updates every shell takes. The key never enters the app or the repository, and `kuito update` refuses one inside the app. Revoking it takes a store build with a new public key.                                                                                                                                                        |
| **A compromised device**                                                     | Out of scope: code that can write the app's own storage can do anything the app can.                                                                                                                                                                                                                                                                                                             |

## Not covered yet

- The end-to-end check on physical devices is pending: fetching, applying and
  rolling back an update were run on the iOS simulator, and the shells'
  checks in the iOS simulator and Android emulator tests.
- Native crashes after the first frame do not count against an update: on
  iOS a Swift trap or `EXC_BAD_ACCESS`, which MetricKit reports at a later
  launch if at all; on Android a native crash or an ANR, which the system
  reports at the next launch. A crash before the first frame counts, as a
  launch that never drew.
- A launch that never drew also counts when the user left during the launch
  screen and the system ended the app in the background, so two of those in a
  row roll back a good update. The rollback is for good: the update is
  refused by its id, which is its content's hash, so publishing the same
  scripts again does not bring it back; change them, or publish a newer
  build.
- The replay protection lives in the app's storage: if that state is lost (the
  app's data cleared, or the file unreadable), the shell starts over from its
  own build time, and a signed update newer than that is taken again. An
  update whose files were damaged on disk is dropped, and only a newer one
  replaces it.
- `createdAt` is the clock of the machine that signed: one signed on a
  machine whose clock runs ahead holds back every update signed after it
  with a correct clock, until the clocks pass it or a store build ships.
- A rolled-back update falls back to the embedded bytecode, not to the update
  that ran before it.
- An app launched only for a background task (docs/background-tasks.md) runs
  its embedded bytecode: the update is chosen when the UI starts.
- The app's code cannot see or trigger updates: there is no API to check now,
  ask for a restart, or read the running update's id.
- No key rotation: a shell trusts the one public key it was built with.
