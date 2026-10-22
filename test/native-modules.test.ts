import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { loadModules } from '../src/cli/modules.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// Built-in modules through the kernel and the real compiler, against the fake
// platform's linked functions (test/support/fake-modules.ts).

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** Compiles `source` as an app with the real compiler and runs it against `host`. */
async function runApp(host: object, source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-modules-'));

  try {
    const entry = join(dir, 'app.tsx');

    writeFileSync(entry, source);

    const output = await createSourceCompiler({ platform: 'ios', outputDir: dir })(entry);

    runInNewContext(output.code, host);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Lets the app's awaits run once their calls have settled. */
const turn = () => new Promise((resolve) => setImmediate(resolve));

test('permissions checks and requests through the native module', async () => {
  const statuses: Record<string, string> = { camera: 'undetermined' };
  const native = fakeModules({
    Permissions: {
      functions: {
        check: {
          thread: 'main',
          run: (name) => ({ status: statuses[name as string] ?? 'denied', canAskAgain: true }),
        },
        request: {
          thread: 'main',
          run: (name) => {
            statuses[name as string] = 'granted';

            return { status: 'granted', canAskAgain: true };
          },
        },
      },
    },
  });
  const kernel = installKernel(
    hosting({ createView() {}, setProp() {}, removeView() {}, ...native.host }),
  );
  const seen = kernel as typeof kernel & { seen?: unknown[] };

  native.attach(kernel);

  await runApp(
    kernel,
    `
    import { Text } from '${process.cwd()}/src/ui/index.ts';
    import { permissions, type PermissionResponse } from '${process.cwd()}/src/native/index.ts';

    const seen: PermissionResponse[] = [];
    (globalThis as never as { seen: PermissionResponse[] }).seen = seen;

    async function ask() {
      seen.push(await permissions.check('camera'));
      seen.push(await permissions.request('camera'));
      seen.push(await permissions.check('camera'));
    }

    void ask();

    export default function App() {
      return <Text>permissions</Text>;
    }
  `,
  );

  for (let step = 0; step < 4; step++) {
    native.flush();
    await turn();
  }

  assert.deepEqual(
    native.calls.map(({ method, args }) => `${method} ${JSON.stringify(args)}`),
    ['check ["camera"]', 'request ["camera"]', 'check ["camera"]'],
  );

  assert.deepEqual(data(seen.seen), [
    { status: 'undetermined', canAskAgain: true },
    { status: 'granted', canAskAgain: true },
    { status: 'granted', canAskAgain: true },
  ]);
});

// The native halves are compiled by Xcode and Gradle, not here; these read
// their sources so a module or a permission cannot land on one platform only.

const matches = (source: string, pattern: RegExp) =>
  [...source.matchAll(pattern)].map((match) => match[1]).sort();

test('every built-in module ships on iOS and Android', async () => {
  const app = mkdtempSync(join(tmpdir(), 'kuito-built-ins-'));
  const builtIn = await loadModules(app).finally(() => rmSync(app, { recursive: true }));

  assert.ok(
    builtIn.some(({ manifest }) => manifest.name === 'Permissions'),
    'Permissions',
  );

  for (const { manifest } of builtIn) {
    assert.ok(manifest.ios, `${manifest.name} on iOS`);
    assert.ok(manifest.android, `${manifest.name} on Android`);
  }
});

test('both platforms define every permission name the spec declares', () => {
  const spec = readFileSync('native/modules/permissions/permissions.ts', 'utf8');
  const union = /export type PermissionName =([^;]+);/.exec(spec)?.[1] ?? '';
  const names = matches(union, /'(\w+)'/g);
  const ios = readFileSync('native/modules/permissions/ios/KuitoPermission.swift', 'utf8');
  const android = readFileSync('native/modules/permissions/android/KuitoPermission.kt', 'utf8');

  assert.deepEqual(names, [
    'camera',
    'location',
    'locationAlways',
    'microphone',
    'notifications',
    'photos',
  ]);

  assert.deepEqual(matches(ios, /^\s*case (\w+)$/gm), names);

  // Kotlin constants cross in camel case: LOCATION_ALWAYS is 'locationAlways'.
  assert.deepEqual(
    matches(android, /^\s*([A-Z_]+)\(/gm).map((name) =>
      name.toLowerCase().replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase()),
    ),
    names,
  );
});
