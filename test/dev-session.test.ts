import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { DevicePatchHub } from '../src/dev/device-server.ts';
import { KERNEL_OUTPUT } from '../src/dev/kernel.ts';
import { LiveSession } from '../src/dev/session.ts';
import { present } from './support/present.ts';
import { assertKernel, type KuitoGlobals } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

const kernel = await readFile(KERNEL_OUTPUT, 'utf8');
const patch = (increment: number, prefix: string) => `__kuito.patch('counter',function(api){
 var count = api.state('count',0);
 api.render(__kuitoJSX('Button',{id:'counter',text:function(){ return '${prefix}' + count.value; },onPress:function(){ count.value += ${increment}; }}));
});`;

async function waitFor(condition: () => boolean, timeoutMs = 2_500) {
  const started = Date.now();

  while (!condition()) {
    if (Date.now() - started > timeoutMs)
      throw new Error('Timed out waiting for filesystem refresh');

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface Fixture {
  file: string;
  /** The revisions the host received, in order. */
  patches: number[];
  views: Map<string, string>;
  context: KuitoGlobals;
  session: LiveSession;
}

interface PatchOutcome {
  changed: string[];
  ms: number;
}

interface Patched extends PatchOutcome {
  revision: number;
  delivered: number;
  initial: boolean;
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/** A compiler over plain JS files: like the real one, a new revision only for new output. */
function fileCompiler(extra: { directories?: string[] } = {}) {
  let revision = 0,
    last = '';

  return async (entry: string) => {
    const code = await readFile(entry, 'utf8').catch(() => '');
    const hash = sha1(code);

    if (hash !== last) revision++;
    last = hash;

    return { path: entry, code, hash, revision, watched: [entry], ...extra };
  };
}

async function fixture(action: (fixture: Fixture) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-live-'));
  const file = join(dir, 'counter.js');
  const views = new Map<string, string>();
  const context = hosting({
    createView() {},
    removeView() {},
    setProp(id: string, name: string, value: unknown) {
      if (name === 'text') views.set(id, String(value));
    },
  });

  runInNewContext(kernel, context);
  assertKernel(context);

  const patches: number[] = [];
  const host = {
    async patch({ code, revision }: { code: string; revision: number }) {
      patches.push(revision);
      runInNewContext(code, context);

      return { delivered: 1 };
    },
  };
  const session = new LiveSession({ entry: file, compile: fileCompiler(), host, debounceMs: 25 });

  try {
    await action({ file, patches, views, context, session });
  } finally {
    await session.stop();
    await rm(dir, { recursive: true, force: true });
  }
}

test('watching an edited file preserves state and swaps handler and binding', async () => {
  await fixture(async ({ file, views, context, session }) => {
    await writeFile(file, patch(1, 'Count: '));
    await session.start();
    assert.equal(session.revision, 1);
    nativeEvent(context.__kuito, 'counter.press');
    assert.equal(views.get('counter'), 'Count: 1');

    const original = present(context.__kuito.state('counter', 'count'), 'count state');

    await writeFile(file, patch(2, 'Total: '));
    await waitFor(() => session.revision >= 2);
    assert.equal(views.get('counter'), 'Total: 1');
    assert.strictEqual(context.__kuito.state('counter', 'count'), original);
    nativeEvent(context.__kuito, 'counter.press');
    assert.equal(views.get('counter'), 'Total: 3');
    assert.equal(original.listenerCount, 1);
  });
});

test('broken refresh preserves last good module and recovers after next edit', async () => {
  await fixture(async ({ file, views, context, session }) => {
    const rejected: unknown[] = [];

    session.on('rejected', (error: unknown) => rejected.push(error));
    await writeFile(file, patch(1, 'Count: '));
    await session.start();
    await writeFile(file, 'throw new Error("BAD_PATCH");');
    await waitFor(() => rejected.length > 0);
    assert.equal(session.revision, 1);
    nativeEvent(context.__kuito, 'counter.press');
    assert.equal(views.get('counter'), 'Count: 1');
    await writeFile(file, patch(3, 'Fixed: '));
    // The rejected output had revision 2: a revision names an output, applied or not.
    await waitFor(() => session.revision === 3);
    nativeEvent(context.__kuito, 'counter.press');
    assert.equal(views.get('counter'), 'Fixed: 4');
  });
});

test('a compile failure on first start keeps the watcher alive for recovery', async () => {
  await fixture(async ({ file, views, session }) => {
    let rejected = 0;

    session.on('rejected', () => rejected++);
    await writeFile(file, 'throw new Error("INVALID_FIRST_PATCH");');
    await session.start();
    assert.equal(rejected, 1);
    await writeFile(file, patch(1, 'Recovered: '));
    // The rejected first output was revision 1.
    await waitFor(() => session.revision === 2);
    assert.equal(views.get('counter'), 'Recovered: 0');
  });
});

test('patch outcomes report the edited files and how long the patch took', async () => {
  await fixture(async ({ file, session }) => {
    const patched: Patched[] = [];
    const rejected: PatchOutcome[] = [];

    session.on('patched', (event: Patched) => patched.push(event));
    session.on('rejected', (_error: unknown, event: PatchOutcome) => rejected.push(event));
    await writeFile(file, patch(1, 'Count: '));
    await session.start();
    assert.equal(patched[0].initial, true, 'the initial build says so');
    assert.deepEqual(patched[0].changed, [], 'initial build is not an edit');
    await writeFile(file, patch(2, 'Total: '));
    await waitFor(() => patched.length >= 2);
    assert.equal(patched[1].initial, false);
    assert.deepEqual(patched[1].changed, [file]);
    assert.equal(patched[1].revision, 2);
    assert.equal(typeof patched[1].ms, 'number');
    await writeFile(file, 'this is not javascript (');
    await waitFor(() => rejected.length > 0);
    assert.deepEqual(rejected[0].changed, [file]);
    assert.equal(typeof rejected[0].ms, 'number');
  });
});

test('a watched directory rebuilds when a file is added anywhere inside it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-routes-'));
  const nested = join(dir, '(home)');
  const added = join(nested, 'about.tsx');
  const patched: PatchOutcome[] = [];

  await mkdir(nested);

  // Every build differs, as a new route changes the routes module.
  let builds = 0;
  const session = new LiveSession({
    entry: dir,
    compile: async () => {
      builds++;

      return {
        path: dir,
        code: String(builds),
        hash: String(builds),
        revision: builds,
        directories: [dir],
      };
    },
    host: { patch: async () => ({ delivered: 1 }) },
    debounceMs: 25,
  });

  session.on('patched', (event: PatchOutcome) => patched.push(event));

  try {
    await session.start();

    // A recursive watch on macOS (FSEvents) starts streaming a moment after
    // it is created; the write repeats, slower than the debounce, until the
    // session sees one.
    let written = 0;

    await waitFor(() => {
      if (Date.now() - written > 200) {
        writeFileSync(added, 'export default function About() {}');
        written = Date.now();
      }

      return patched.some((event) => event.changed.includes(added));
    });
  } finally {
    await session.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a patch no device received reports no delivery, and no device applied it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-no-devices-'));
  const file = join(dir, 'app.js');
  const hub = new DevicePatchHub();
  const patched: Patched[] = [];
  const acks: unknown[] = [];
  const session = new LiveSession({
    entry: file,
    compile: fileCompiler(),
    host: hub,
    debounceMs: 25,
  });

  session.on('patched', (event: Patched) => patched.push(event));
  hub.on('ack', (ack: unknown) => acks.push(ack));

  try {
    await writeFile(file, patch(1, 'Count: '));
    await session.start();

    assert.equal(hub.clients.size, 0, 'no device is connected');
    assert.equal(patched[0].delivered, 0);
    assert.deepEqual(acks, [], 'nothing was applied anywhere');
  } finally {
    await session.stop();
    hub.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unchanged rebuild sends no patch', async () => {
  await fixture(async ({ file, patches, session }) => {
    const unchanged: PatchOutcome[] = [];

    session.on('unchanged', (event: PatchOutcome) => unchanged.push(event));
    await writeFile(file, patch(1, 'Count: '));
    await session.start();

    // Saved again with the same contents: the build's output is the same.
    session.notify(file);
    await waitFor(() => unchanged.length > 0);

    assert.deepEqual(patches, [1], 'the host received the first build only');
    assert.deepEqual(unchanged[0].changed, [file]);
    assert.equal(session.revision, 1);
  });
});

test('the host receives the revision the compiler gave the output', async () => {
  await fixture(async ({ file, patches, session }) => {
    await writeFile(file, patch(1, 'Count: '));
    await session.start();
    await writeFile(file, patch(2, 'Total: '));
    await waitFor(() => patches.length >= 2);

    assert.deepEqual(patches, [1, 2]);
    assert.equal(session.revision, 2);
  });
});

test('the time since the edit behind a revision is measured from the edit', async () => {
  await fixture(async ({ file, session }) => {
    await writeFile(file, patch(1, 'Count: '));
    await session.start();
    assert.equal(session.sinceEdit(1), undefined, 'the initial build had no edit');

    const edited = performance.now();

    session.notify(file);
    await writeFile(file, patch(2, 'Total: '));
    await waitFor(() => session.revision === 2);

    const since = present(session.sinceEdit(2), 'time since the edit');

    assert.ok(since >= 25, 'it includes the debounce');
    assert.ok(since <= performance.now() - edited + 1);
    assert.equal(session.sinceEdit(99), undefined);
  });
});

test('the placement report goes out for the first build, then for each file whose report changed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-placement-'));
  const entry = join(dir, 'app.tsx');
  const builds = [
    [
      { file: 'app.tsx', entries: [{ site: 'Box opacity', line: 3, column: 9 }] },
      { file: 'card.tsx', entries: [{ site: 'Box rotate', line: 5, column: 9 }] },
    ],
    [
      { file: 'app.tsx', entries: [{ site: 'Box opacity', line: 3, column: 9 }] },
      {
        file: 'card.tsx',
        entries: [{ site: 'Box rotate', line: 5, column: 9, reason: 'constructs Thing' }],
      },
    ],
  ];
  const reported: unknown[] = [];
  let build = 0;

  await writeFile(entry, '');

  const session = new LiveSession({
    entry,
    compile: async () => {
      const placement = builds[Math.min(build, builds.length - 1)];

      build++;

      return { path: entry, code: String(build), hash: String(build), revision: build, placement };
    },
    host: { patch: () => ({ delivered: 1 }) },
    watchFiles: false,
  });

  session.on('placement', (files) => reported.push(files.map(({ file }) => file)));

  try {
    await session.start();
    session.notify(entry);
    await waitFor(() => build >= 2 && reported.length >= 2);
    session.notify(entry);
    await waitFor(() => build >= 3);

    assert.deepEqual(reported, [['app.tsx', 'card.tsx'], ['card.tsx']]);
  } finally {
    await session.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
