import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytecodeArgs, compilerTarball, hermes, hermescEntry } from '../src/cli/hermesc.ts';
import {
  HERMES_PACKAGES,
  hermesPackage,
  hermesTarball,
  PACKAGE_MANIFEST,
} from '../src/cli/hermes-ios.ts';

const read = (path: string) => readFileSync(path, 'utf8');
const pinned = JSON.parse(read('native/hermes.json')) as unknown;

test('the CLI compiles with the Hermes release native/hermes.json pins', () => {
  assert.deepEqual(hermes, pinned);

  assert.equal(
    compilerTarball(),
    `https://registry.npmjs.org/hermes-compiler/-/hermes-compiler-${hermes.version}.tgz`,
  );
});

// Gradle and CI read native/hermes.json; a version or commit written into
// them as well would drift from it.
for (const [consumer, path] of [
  ['Android', 'native/android/app/build.gradle.kts'],
  ['CI', '.github/workflows/hermes-feasibility.yml'],
]) {
  test(`${consumer} reads its Hermes pin from native/hermes.json`, () => {
    const source = read(path);

    assert.match(source, /hermes\.json/);
    assert.ok(!source.includes(hermes.version), `${path} repeats the version`);
    assert.ok(!source.includes(hermes.iosSha256), `${path} repeats the iOS checksum`);
    assert.ok(!source.includes(hermes.iosReleaseSha256), `${path} repeats the iOS checksum`);
    assert.doesNotMatch(source, /\b[0-9a-f]{40}\b/, `${path} pins a commit of its own`);
  });
}

test('iOS links the pinned release as a local Swift package around its xcframework', () => {
  assert.equal(
    hermesTarball(),
    `https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${hermes.version}/hermes-ios-${hermes.version}-hermes-ios-debug.tar.gz`,
  );

  assert.ok(HERMES_PACKAGES.debug.endsWith(`hermes-ios-${hermes.version}`));

  assert.match(
    PACKAGE_MANIFEST,
    /\.binaryTarget\(name: "hermesvm", path: "hermesvm\.xcframework"\)/,
  );

  assert.ok(!PACKAGE_MANIFEST.includes(hermes.version), 'the manifest repeats the version');
});

// The debug variant is a debug build of the VM, with its debugger: a release
// shell measured on it would time an unoptimized interpreter.
test('a release iOS shell links the release Hermes, unpacked beside the debug one', () => {
  assert.equal(
    hermesTarball('release'),
    `https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${hermes.version}/hermes-ios-${hermes.version}-hermes-ios-release.tar.gz`,
  );

  assert.ok(HERMES_PACKAGES.release.endsWith(`hermes-ios-${hermes.version}-release`));
  assert.notEqual(hermes.iosReleaseSha256, hermes.iosSha256);
});

for (const profile of ['debug', 'release'] as const)
  test(`a ${profile} Hermes download that does not match its pinned SHA-256 is never unpacked`, async () => {
    const directory = join(mkdtempSync(join(tmpdir(), 'kuito-hermes-')), 'hermes-ios');
    const urls: string[] = [];

    await assert.rejects(
      hermesPackage(profile, directory, async (url) => {
        urls.push(url);
        return Buffer.from('not hermes');
      }),
      /does not match its pinned SHA-256/,
    );

    assert.deepEqual(urls, [hermesTarball(profile)]);
    assert.ok(!existsSync(directory));
  });

test("Android's vendored JSI is the one the pinned Hermes was built against", () => {
  const [tag, commit] = read('native/android/app/src/main/cpp/jsi/jsi/VERSION').trim().split(/\s+/);

  assert.equal(tag, `hermes-v${hermes.version}`);
  assert.equal(commit, hermes.commit);
});

test('the compiler comes from the hermes-compiler package for the host platform', () => {
  assert.equal(hermescEntry('darwin'), 'package/hermesc/osx-bin/hermesc');
  assert.equal(hermescEntry('linux'), 'package/hermesc/linux64-bin/hermesc');
  assert.throws(() => hermescEntry('aix'), /no Hermes compiler for aix/);
});

test("the bundled app's bytecode keeps what the debugger needs to show its scopes", () => {
  const args = bytecodeArgs('app.js', 'app.hbc');

  // -g1 keeps only backtrace locations: DevTools then finds no local scope.
  assert.ok(args.includes('-g3'));
  // Optimized code keeps no scopes to evaluate in: DevTools' console fails in paused frames.
  assert.ok(args.includes('-O0'));
  assert.ok(!args.includes('-O'));
  assert.deepEqual(args.slice(-3), ['-out', 'app.hbc', 'app.js']);
});

test('release bytecode is optimized and carries no debug info', () => {
  const args = bytecodeArgs('app.js', 'app.hbc', 'release');

  assert.ok(args.includes('-O'));
  assert.ok(!args.includes('-O0'));
  assert.ok(!args.some((arg) => arg.startsWith('-g')), 'no -g level');
  assert.deepEqual(args.slice(-3), ['-out', 'app.hbc', 'app.js']);
});
