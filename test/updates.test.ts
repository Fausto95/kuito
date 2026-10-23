import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, ROOT } from '../src/cli/config.ts';
import { buildDeviceAssets } from '../src/cli/device-assets.ts';
import { configuredModules, shellModules } from '../src/cli/modules.ts';
import { buildAndroid, buildIOS } from '../src/cli/platforms.ts';
import type { Project } from '../src/cli/project.ts';
import { shellFingerprint, type FingerprintInputs } from '../src/cli/shell-fingerprint.ts';
import {
  createKeyPair,
  parsePublicKey,
  signUpdate,
  updateKey,
  verifyUpdate,
  type UpdateManifest,
} from '../src/cli/update-signing.ts';
import { buildUpdate, UPDATE_SETTINGS_FILE, writeKeyPair } from '../src/cli/updates.ts';
import { resolveConfig } from '../src/cli/kuito-config.ts';
import { fixtureDevice, type RunOptions } from './support/cli.ts';

const FIXTURE = join(ROOT, 'test/fixtures/crash-app.tsx');

function tempDir(prefix = 'kuito-update-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

const BASE = {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
};

const configWith = (settings: Record<string, unknown>, file = '/app/kuito.config.ts') =>
  resolveConfig({ ...BASE, ...settings }, file, 'production');

/** A project whose updates are checked with a fresh key; the private half outside it. */
function signedProject(settings: Record<string, unknown> = {}) {
  const root = tempDir();
  const keys = tempDir('kuito-update-key-');
  const { privateKey, publicKey } = createKeyPair();
  const keyFile = join(keys, 'update-key.pem');

  writeFileSync(keyFile, privateKey);

  const config = configWith(
    { updates: { url: 'https://updates.example.com/reel', publicKey }, ...settings },
    join(root, 'kuito.config.ts'),
  );
  const project: Project = {
    root,
    cache: join(root, '.kuito'),
    environment: 'production',
    config,
  };

  return { project, publicKey, environment: { KUITO_UPDATE_KEY_PATH: keyFile } };
}

const manifest = (fields: Partial<UpdateManifest> = {}): UpdateManifest => ({
  format: 1,
  id: '0123456789abcdef',
  app: 'com.example.reel',
  platform: 'ios',
  url: 'https://updates.example.com/reel',
  fingerprint: 'f'.repeat(64),
  createdAt: 1_761_134_400_000,
  files: [{ path: 'app.hbc', sha256: 'a'.repeat(64), size: 3 }],
  ...fields,
});

test('kuito update builds and signs for a platform, or makes the key pair', () => {
  const build = parseArgs(['update', 'build', 'ios', '--out', 'dist'], { cwd: '/app' });

  assert.equal(build.command, 'update');
  assert.equal(build.action, 'build');
  assert.equal(build.platform, 'ios');
  assert.equal(build.out, '/app/dist');
  assert.equal(build.env, 'production');

  const key = parseArgs(['update', 'key', '../keys/update.pem'], { cwd: '/app' });

  assert.equal(key.action, 'key');
  assert.equal(key.file, '/keys/update.pem');

  assert.throws(() => parseArgs(['update']), /kuito update build <platform>/);
  assert.throws(() => parseArgs(['update', 'key']), /kuito update key <file>/);
  assert.throws(() => parseArgs(['build', 'ios', '--out', 'dist']), /--out only applies/);
});

test('updates name an https URL and the P-256 public key their signatures are checked with', () => {
  const { publicKey } = createKeyPair();

  assert.equal(configWith({}).updates, null);

  assert.deepEqual(configWith({ updates: { url: 'https://example.com/u', publicKey } }).updates, {
    url: 'https://example.com/u',
    publicKey,
  });

  assert.throws(
    () => configWith({ updates: { url: 'http://example.com/u', publicKey } }),
    /updates\.url must be an https URL/,
  );

  assert.throws(
    () => configWith({ updates: { url: 'https://example.com/u' } }),
    /updates\.publicKey/,
  );

  assert.throws(
    () => configWith({ updates: { url: 'https://example.com/u', publicKey: 'not a key' } }),
    /updates\.publicKey must be .*kuito update key/,
  );
});

test('a public key is a P-256 key: another curve or algorithm is refused', () => {
  const ed25519 = generateKeyPairSync('ed25519')
    .publicKey.export({ type: 'spki', format: 'der' })
    .toString('base64');
  const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
    .publicKey.export({ type: 'spki', format: 'der' })
    .toString('base64');

  assert.equal(parsePublicKey(createKeyPair().publicKey).asymmetricKeyType, 'ec');
  assert.throws(() => parsePublicKey(ed25519), /P-256/);
  assert.throws(() => parsePublicKey(p384), /P-256/);
});

test('the private key comes from the environment or a file outside the app, never from it', () => {
  const root = tempDir();
  const outside = tempDir('kuito-update-key-');
  const { privateKey } = createKeyPair();
  const inside = join(root, 'keys/update.pem');
  const kept = join(outside, 'update.pem');

  mkdirSync(join(root, 'keys'));
  writeFileSync(inside, privateKey);
  writeFileSync(kept, privateKey);

  assert.throws(() => updateKey(root, {}), /KUITO_UPDATE_KEY_PATH or KUITO_UPDATE_KEY/);

  assert.throws(
    () => updateKey(root, { KUITO_UPDATE_KEY_PATH: inside }),
    /inside the app.*move it out/,
  );

  assert.throws(
    () => updateKey(root, { KUITO_UPDATE_KEY_PATH: join(outside, 'missing.pem') }),
    /does not exist/,
  );

  // An app inside a repository: the key may not sit anywhere in that repository.
  mkdirSync(join(outside, '.git'));
  mkdirSync(join(outside, 'apps/reel'), { recursive: true });

  assert.throws(
    () => updateKey(join(outside, 'apps/reel'), { KUITO_UPDATE_KEY_PATH: kept }),
    /inside the repository/,
  );

  assert.equal(updateKey(root, { KUITO_UPDATE_KEY_PATH: kept }).type, 'private');
  assert.equal(updateKey(root, { KUITO_UPDATE_KEY: privateKey }).type, 'private');
});

test('kuito update key writes the private key outside the app, readable by its owner only', async () => {
  const root = tempDir();
  const file = join(tempDir('kuito-update-key-'), 'update.pem');
  const publicKey = await writeKeyPair(file, root);

  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(parsePublicKey(publicKey).asymmetricKeyType, 'ec');
  assert.equal(createPrivateKey(readFileSync(file, 'utf8')).asymmetricKeyType, 'ec');

  await assert.rejects(writeKeyPair(file, root), /already exists/);
  await assert.rejects(writeKeyPair(join(root, 'update.pem'), root), /inside the app/);
});

test('a signature covers the manifest’s exact bytes: any change, or another key, fails', () => {
  const { privateKey, publicKey } = createKeyPair();
  const key = createPrivateKey(privateKey);
  const signed = signUpdate(manifest(), key);

  assert.deepEqual(verifyUpdate(signed, parsePublicKey(publicKey)), manifest());

  const tampered = {
    ...signed,
    manifest: signed.manifest.replace('"createdAt":1', '"createdAt":2'),
  };

  assert.notEqual(tampered.manifest, signed.manifest);
  assert.throws(() => verifyUpdate(tampered, parsePublicKey(publicKey)), /signature/);
  assert.throws(() => verifyUpdate(signed, parsePublicKey(createKeyPair().publicKey)), /signature/);

  assert.throws(
    () => verifyUpdate({ manifest: signed.manifest }, parsePublicKey(publicKey)),
    /signature/,
  );
});

test('a manifest names only the scripts a shell loads, by safe relative paths', () => {
  const { privateKey, publicKey } = createKeyPair();
  const key = createPrivateKey(privateKey);
  const check = (files: UpdateManifest['files']) =>
    verifyUpdate(signUpdate(manifest({ files }), key), parsePublicKey(publicKey));
  const file = (path: string) => ({ path, sha256: 'a'.repeat(64), size: 1 });

  assert.equal(
    check([
      file('bootstrap.hbc'),
      file('ui.hbc'),
      file('app.hbc'),
      file('app-ui.hbc'),
      file('modules/x-Ab_1.hbc'),
    ]).files.length,
    5,
  );

  for (const path of ['../app.hbc', '/app.hbc', 'modules/../../x.hbc', 'app.js', 'modules/.x.hbc'])
    assert.throws(() => check([file(path)]), /path/, path);

  assert.throws(() => check([file('app.hbc'), file('app.hbc')]), /twice/);
});

async function framework() {
  const dir = tempDir('kuito-framework-');

  for (const [path, contents] of Object.entries({
    'native/hermes.json': '{"version":"1"}',
    'native/shared/Wire.h': '// wire',
    'native/ios/Renderer/View.swift': '// view',
    'native/ios/Tests/ViewTests.swift': '// tests',
    'native/android/app/src/main/View.kt': '// view',
  })) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }

  return dir;
}

test('a shell’s fingerprint follows its native code, link table and assets, not its version', async () => {
  const root = await framework();
  const inputs: FingerprintInputs = {
    platform: 'ios',
    framework: root,
    config: configWith({}),
    modules: [],
    link: '// link',
    assets: [],
  };
  const base = await shellFingerprint(inputs);
  const changed = async (change: () => void | FingerprintInputs) => {
    const replaced = change();
    const fingerprint = await shellFingerprint(replaced ?? inputs);

    return fingerprint !== base;
  };

  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(await shellFingerprint(inputs), base);

  assert.equal(
    await changed(() => ({ ...inputs, config: configWith({ version: '2.0.0', buildNumber: 7 }) })),
    false,
    'a new version or build number needs no new shell',
  );

  assert.equal(
    await changed(() => writeFileSync(join(root, 'native/ios/Tests/ViewTests.swift'), '// more')),
    false,
    'tests are not in the shell',
  );

  assert.equal(
    await changed(() => writeFileSync(join(root, 'native/android/app/src/main/View.kt'), '//')),
    false,
    'another platform’s code is not in the shell',
  );

  assert.ok(await changed(() => ({ ...inputs, platform: 'android' })));
  assert.ok(await changed(() => ({ ...inputs, link: '// another function' })));

  assert.ok(
    await changed(() => ({
      ...inputs,
      assets: [
        {
          name: 'logo',
          file: '/app/logo.png',
          type: 'png',
          variants: [],
          width: 1,
          height: 1,
          hash: 'x',
        },
      ],
    })),
  );

  assert.ok(
    await changed(() => ({
      ...inputs,
      config: configWith({ migrations: ['CREATE TABLE t (x)'] }),
    })),
  );

  assert.ok(
    await changed(() => ({
      ...inputs,
      config: configWith({ permissions: { camera: 'Scan codes' } }),
    })),
    'a permission is a native entry',
  );

  for (const [path, contents] of Object.entries({
    'native/android/local.properties': 'sdk.dir=/Users/someone/Library/Android/sdk',
    'native/android/.kotlin/errors/errors-1.log': 'daemon died',
    'native/android/app/src/main/assets/kuito/app.hbc': 'stale bytecode',
    'native/ios/App/Info.plist': '<plist/>',
    'native/ios/App/Resources/app.hbc': 'stale bytecode',
    'native/ios/KuitoIOS.xcodeproj/project.pbxproj': '// generated',
  })) {
    mkdirSync(join(root, path, '..'), { recursive: true });

    assert.equal(
      await changed(() => writeFileSync(join(root, path), contents)),
      false,
      `${path} is a machine's or a build's, not the shell's source`,
    );
  }

  assert.ok(
    await changed(() => writeFileSync(join(root, 'native/hermes.json'), '{"version":"2"}')),
  );

  assert.ok(await changed(() => writeFileSync(join(root, 'native/shared/Wire.h'), '// wire 2')));
});

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('kuito update build signs the release bytecode for the shell it fits, laid out to host as is', async () => {
  const { project, publicKey, environment } = signedProject();
  const out = join(project.root, 'dist');
  const { directory, manifest: signed } = await buildUpdate({
    entry: FIXTURE,
    project,
    platform: 'ios',
    out,
    environment,
    now: () => 1_761_134_400_000,
  });

  assert.equal(directory, join(out, 'ios', signed.fingerprint));

  const envelope: unknown = JSON.parse(readFileSync(join(directory, 'update.json'), 'utf8'));
  const verified = verifyUpdate(envelope, parsePublicKey(publicKey));

  assert.deepEqual(verified, signed);
  assert.equal(verified.app, 'com.example.reel');
  assert.equal(verified.platform, 'ios');
  assert.equal(verified.createdAt, 1_761_134_400_000);

  assert.equal(
    verified.url,
    'https://updates.example.com/reel',
    'it is for the host it is published on',
  );

  assert.deepEqual(
    verified.files.map(({ path }) => path).filter((path) => !path.startsWith('modules/')),
    ['bootstrap.hbc', 'ui.hbc', 'app.hbc', 'app-ui.hbc'],
    'each UI-thread script ships with the script that names it',
  );

  for (const { path, sha256: hash, size } of verified.files) {
    const file = join(directory, verified.id, path);

    assert.equal(sha256(file), hash, path);
    assert.equal(statSync(file).size, size, path);
  }

  for (const map of ['app.hbc.map', 'app.js.map'])
    assert.ok(
      existsSync(join(project.cache, 'sourcemaps/ios', `update-${verified.id}`, map)),
      `the update keeps ${map} for kuito symbolicate`,
    );
});

test('an update is signed only with the key the shell checks it with', async () => {
  const { project } = signedProject();
  const other = join(tempDir('kuito-update-key-'), 'other.pem');

  writeFileSync(other, createKeyPair().privateKey);

  await assert.rejects(
    buildUpdate({
      entry: FIXTURE,
      project,
      platform: 'android',
      environment: { KUITO_UPDATE_KEY_PATH: other },
    }),
    /does not match updates\.publicKey/,
  );

  await assert.rejects(
    buildUpdate({
      entry: FIXTURE,
      project: { ...project, config: { ...project.config, updates: null } },
      platform: 'android',
      environment: {},
    }),
    /set updates in .*kuito\.config\.ts/,
  );
});

function recorder() {
  return {
    async run(_bin: string, _args: readonly string[] = [], _opts: RunOptions = {}) {
      return { stdout: '', stderr: '' };
    },
  };
}

test('a release shell carries what checks its updates; an update built from the same app fits it', async () => {
  const { project, publicKey, environment } = signedProject();
  const compiled = await buildDeviceAssets(FIXTURE, project, 'android', { profile: 'release' });
  const shell = await shellModules(
    project.root,
    { uses: compiled.nativeModules, links: compiled.links, linkHash: compiled.linkHash },
    configuredModules(project.config),
  );

  // An APK for an emulator: a store build would first need an upload key.
  const device = fixtureDevice({ platform: 'android', id: 'emulator-5554', emulator: true });

  await buildAndroid(recorder(), {
    project,
    ...shell,
    device,
    profile: 'release',
    environment,
  }).catch(() => {});

  const settings: unknown = JSON.parse(
    readFileSync(join(project.cache, 'android/assets', UPDATE_SETTINGS_FILE), 'utf8'),
  );
  const { manifest: update } = await buildUpdate({
    entry: FIXTURE,
    project,
    platform: 'android',
    environment,
  });

  assert.deepEqual(settings, {
    url: 'https://updates.example.com/reel',
    publicKey,
    fingerprint: update.fingerprint,
    builtAt: (settings as { builtAt: number }).builtAt,
  });

  assert.ok(Number.isInteger((settings as { builtAt: number }).builtAt));

  // A debug shell takes Live Patches, never updates.
  await buildAndroid(recorder(), { project, ...shell, environment }).catch(() => {});

  assert.ok(!existsSync(join(project.cache, 'android/assets', UPDATE_SETTINGS_FILE)));
});

test(
  'the iOS release shell carries its update settings in its resources',
  { tags: ['macos'] },
  async () => {
    const { project, environment } = signedProject({
      ios: { ...BASE.ios, teamId: 'A1B2C3D4E5' },
    });
    const shell = await shellModules(project.root, { uses: [], links: [], linkHash: '' });

    await buildIOS(recorder(), {
      project,
      ...shell,
      device: null,
      profile: 'release',
      environment,
      hermes: async () => '/hermes',
    }).catch(() => {});

    assert.ok(existsSync(join(project.cache, 'ios/Resources', UPDATE_SETTINGS_FILE)));
  },
);

const fixture = (platform: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, `test/fixtures/updates/${platform}.json`), 'utf8'));

test('the updates the shells’ tests verify are ones the CLI signed, in the current format', () => {
  for (const platform of ['ios', 'android']) {
    const { publicKey, envelope, script } = fixture(platform) as {
      publicKey: string;
      envelope: unknown;
      script: string;
    };
    const verified = verifyUpdate(envelope, parsePublicKey(publicKey));

    assert.equal(verified.platform, platform);
    assert.equal(verified.files[0]?.sha256, createHash('sha256').update(script).digest('hex'));
  }
});

const shellSource = (path: string) => readFileSync(join(ROOT, path), 'utf8');

test('only the release shells take updates, and their crash reports name the update they ran', () => {
  for (const [release, debug] of [
    [
      'native/ios/App/Release/KuitoViewController.swift',
      'native/ios/App/Debug/KuitoViewController.swift',
    ],
    [
      'native/android/app/src/release/java/dev/kuito/runtime/KuitoActivity.kt',
      'native/android/app/src/debug/java/dev/kuito/runtime/KuitoActivity.kt',
    ],
  ]) {
    assert.match(shellSource(release), /KuitoUpdates/, release);
    assert.doesNotMatch(shellSource(debug), /KuitoUpdates/, debug);
  }

  assert.match(shellSource('native/ios/App/KuitoCrashReports.swift'), /\bupdate\b/);

  assert.match(
    shellSource('native/android/app/src/main/java/dev/kuito/runtime/KuitoCrashReports.kt'),
    /"update"/,
  );
});
