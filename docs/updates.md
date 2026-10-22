# Deliver a JavaScript update

Use an over-the-air update for a TypeScript or CSS fix compatible with an installed release shell. Updates replace bytecode on the next launch. Native code, modules, permissions, assets, fonts and database migrations require a new native build.

## Configure signing

Create an update key outside the app directory:

```sh
kuito update key ~/keys/myapp-updates.pem
```

The command writes a private key and prints its public key. Configure the host and public key before building the release shell:

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

Replace the example public key with the full generated value. Keep the private key outside the repository and app; the CLI refuses a private-key path inside the app. Debug builds and release builds without this config do not download updates.

## Build and upload

```sh
KUITO_UPDATE_KEY_PATH=~/keys/myapp-updates.pem kuito update build ios
```

Alternatively, provide PEM contents through `KUITO_UPDATE_KEY`. `--env` chooses an environment and `--out` chooses the output directory. The default environment is production.

```text
.kuito/updates/
  ios/<fingerprint>/
    update.json     the signed manifest a shell fetches
    <id>/*.hbc      the kernels and the app
    <id>/modules/   the app's chunks
```

Upload these files to the configured HTTPS host without changing their relative paths. Upload bytecode under `<id>/` first and publish `update.json` last. Retain `.kuito/sourcemaps/<platform>/update-<id>/` with the release artifacts so errors can be [symbolicated](crash-reports.md).

## Understand compatibility and rollout

The shell requests the directory matching its native fingerprint. That fingerprint includes framework native code, Hermes, linked modules, permissions, assets, fonts and migrations. Name, version, build number, icon and launch screen do not determine compatibility. A single host can therefore serve distinct native builds.

After the first frame, the shell downloads the signed manifest, verifies it, then checks each script's size and SHA-256. The current session continues running its current code. A verified newer update becomes eligible on the next launch; older updates are refused.

Two consecutive launches that crash or fail to draw a frame roll back to the embedded bytecode. The failed update is then refused. A native crash after the first frame does not count toward that rollback. Failures and refusals appear in platform logs.

## Current limits

There is no app API to check immediately, force a restart or inspect the active update. Rollback selects the embedded build, not the previous downloaded update. A shell trusts its original public key; key rotation requires a new shell.

See [release builds](release-builds.md) for creating the compatible native app.
