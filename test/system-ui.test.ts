import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import {
  initialSystemBars,
  mergeSystemBars,
  systemBarsCalls,
} from '../src/native/system-bars-stack.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// SystemBars as an app uses it, against a fake SystemUI module that records
// what reaches the platform.

// --- The stack, as plain data ------------------------------------------------

test('the last entry that sets a prop wins it, over the defaults', () => {
  const merged = mergeSystemBars(initialSystemBars, [
    { statusBar: { content: 'dark', hidden: true }, navigationBarColor: '#ffffff' },
    { statusBar: { content: 'light', animated: true }, navigationBarColor: '#000000' },
    {},
  ]);

  assert.deepEqual(merged.statusBar.content, { value: 'light', animated: true });
  assert.deepEqual(merged.statusBar.hidden, { value: true, animated: false, transition: 'fade' });
  assert.deepEqual(merged.statusBar.backgroundColor, initialSystemBars.statusBar.backgroundColor);
  assert.equal(merged.statusBar.translucent, true);
  assert.equal(merged.navigationBarColor, '#000000');
});

test('immersive hides every bar for its entry, and a later entry wins over it', () => {
  const immersive = mergeSystemBars(initialSystemBars, [{ immersive: true }]);

  assert.equal(immersive.statusBar.hidden.value, true);
  assert.equal(immersive.navigationBarHidden, true);
  assert.equal(immersive.homeIndicatorAutoHidden, true);
  assert.equal(immersive.screenEdgesDeferred, true);

  const shown = mergeSystemBars(initialSystemBars, [
    { immersive: true },
    { statusBar: { hidden: false } },
  ]);

  assert.equal(shown.statusBar.hidden.value, false, 'the later entry shows the status bar');
  assert.equal(shown.navigationBarHidden, true);

  const own = mergeSystemBars(initialSystemBars, [{ immersive: true, navigationBarHidden: false }]);

  assert.equal(own.navigationBarHidden, false, 'an entry’s own prop wins over its immersive');
});

test('immersive false sets nothing', () => {
  const merged = mergeSystemBars(initialSystemBars, [{ immersive: true }, { immersive: false }]);

  assert.deepEqual(merged, mergeSystemBars(initialSystemBars, [{ immersive: true }]));
});

test('immersive hides the status bar animated, unless its entry says otherwise', () => {
  const merged = mergeSystemBars(initialSystemBars, [{ immersive: true }]);

  assert.deepEqual(merged.statusBar.hidden, { value: true, animated: true, transition: 'fade' });

  const still = mergeSystemBars(initialSystemBars, [
    { immersive: true, statusBar: { animated: false } },
  ]);

  assert.equal(still.statusBar.hidden.animated, false);
});

test('SystemBars keeps only the props it knows', () => {
  const merged = mergeSystemBars(initialSystemBars, [{ content: 'light' } as never]);

  assert.deepEqual(merged, initialSystemBars);
});

test('only what changed crosses, animated as the entry that set it says', () => {
  const next = mergeSystemBars(initialSystemBars, [
    {
      statusBar: { hidden: true, animated: true, transition: 'slide', backgroundColor: '#000' },
      navigationBarHidden: true,
    },
  ]);

  assert.deepEqual(systemBarsCalls(initialSystemBars, next), [
    { method: 'setStatusBarHidden', args: [true, 'slide'] },
    { method: 'setStatusBarBackgroundColor', args: ['#000', true] },
    { method: 'setNavigationBarHidden', args: [true] },
  ]);

  assert.deepEqual(systemBarsCalls(next, next), []);
});

test('hiding without animation crosses as the none transition', () => {
  const next = mergeSystemBars(initialSystemBars, [
    { statusBar: { hidden: true, transition: 'slide' } },
  ]);

  assert.deepEqual(systemBarsCalls(initialSystemBars, next), [
    { method: 'setStatusBarHidden', args: [true, 'none'] },
  ]);
});

// --- In the kernel ------------------------------------------------------------

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-system-ui-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const tick = () => new Promise<void>((done) => setTimeout(done, 0));

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

interface Apis {
  SystemBars: {
    readonly statusBarHeight: number | null;
  };
  navigate(to: { route: string; params: object }): void;
  goBack(): void;
  setHidden(value: boolean): void;
  setHomeStyle(value: string): void;
  showBars(value: boolean): void;
  setImmersive(value: boolean): void;
  showStatusBar(value: boolean): void;
}

const methods = [
  'setStatusBarStyle',
  'setStatusBarHidden',
  'setStatusBarBackgroundColor',
  'setStatusBarTranslucent',
  'setBackgroundColor',
  'setNavigationBarColor',
  'setNavigationBarButtonStyle',
  'setNavigationBarHidden',
  'setScreenEdgesDeferred',
  'setHomeIndicatorAutoHidden',
];

function systemUI(hiddenAtLaunch: boolean): Record<string, FakeModule> {
  const functions: FakeModule['functions'] = {
    statusBarHeight: { thread: 'js', run: () => 24 },
    statusBarHiddenAtLaunch: { thread: 'js', run: () => hiddenAtLaunch },
  };

  for (const method of methods) functions[method] = { thread: 'main', run: () => null };

  return { SystemUI: { functions } };
}

async function launch(entry = 'test/fixtures/system-ui-app.tsx', hiddenAtLaunch = false) {
  const native = fakeModules(systemUI(hiddenAtLaunch));
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      moveView() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await compile(entry), kernel);

  /** Lets the app render and the stack apply, then settles the native calls. */
  const settle = async () => {
    await tick();
    native.flush();
    await tick();
  };

  /** The calls that changed the platform since the last read, as it decoded them. */
  const sent = () =>
    data(native.calls.splice(0).filter((call) => call.method !== 'statusBarHiddenAtLaunch'));

  const patch = async () => {
    runInNewContext(await compile(entry), kernel);
    await settle();
  };

  await settle();

  return { ...native, ...(kernel as unknown as Apis), settle, sent, patch };
}

const call = (method: string, ...args: unknown[]) => ({ module: 'SystemUI', method, args });

test('a mounted SystemBars sets its props; only what differs from the platform crosses', async () => {
  const app = await launch();

  assert.deepEqual(app.sent(), [call('setStatusBarStyle', 'dark-content', false)]);
});

test('the last mounted SystemBars wins, and unmounting it gives the props back', async () => {
  const app = await launch();

  app.sent();
  app.setHidden(true);
  await app.settle();
  assert.deepEqual(app.sent(), [call('setStatusBarHidden', true, 'slide')]);

  app.setHidden(false);
  await app.settle();
  assert.deepEqual(app.sent(), [call('setStatusBarHidden', false, 'none')]);
});

test('a SystemBars whose props change keeps its place in the stack', async () => {
  const app = await launch();

  app.sent();
  app.setHidden(true);
  await app.settle();
  app.setHomeStyle('light');
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarHidden', true, 'slide'),
    call('setStatusBarStyle', 'light-content', false),
  ]);
});

test('a pushed screen’s SystemBars wins while it shows; going back restores the one below', async () => {
  const app = await launch();

  app.sent();
  app.navigate({ route: 'night', params: {} });
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarStyle', 'light-content', false),
    call('setStatusBarBackgroundColor', '#000', false),
  ]);

  app.goBack();
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarStyle', 'dark-content', false),
    call('setStatusBarBackgroundColor', '#00000000', false),
  ]);
});

test('a route’s systemBars option applies while its screen is focused', async () => {
  const app = await launch();

  app.sent();
  app.navigate({ route: 'photo', params: {} });
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarStyle', 'light-content', false),
    call('setStatusBarHidden', true, 'none'),
  ]);

  app.goBack();
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarStyle', 'dark-content', false),
    call('setStatusBarHidden', false, 'none'),
  ]);
});

test('the stack starts from the status bar the app launched with', async () => {
  const app = await launch(undefined, true);

  assert.deepEqual(app.sent(), [call('setStatusBarStyle', 'dark-content', false)]);

  app.setHidden(true);
  await app.settle();
  assert.deepEqual(app.sent(), [], 'already hidden, as it launched');
});

test('SystemBars.statusBarHeight reads the platform’s height synchronously', async () => {
  const app = await launch();

  assert.equal(app.SystemBars.statusBarHeight, 24);
});

test('Live Patch keeps the mounted SystemBars in the stack', async () => {
  const temp = mkdtempSync(resolve('test/fixtures/.system-ui-'));
  const file = join(temp, 'app.tsx');

  onTestFinished(() => rmSync(temp, { recursive: true, force: true }));
  writeFileSync(file, readFileSync('test/fixtures/system-ui-app.tsx'));

  const app = await launch(file);

  await app.patch();
  app.navigate({ route: 'night', params: {} });
  await app.settle();
  app.sent();
  app.goBack();
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarStyle', 'dark-content', false),
    call('setStatusBarBackgroundColor', '#00000000', false),
  ]);
});

test('SystemBars sets the bars and root view; unmounting gives them back', async () => {
  const app = await launch();

  app.sent();
  app.showBars(true);
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setBackgroundColor', '#101014'),
    call('setNavigationBarColor', '#ffffff'),
    call('setNavigationBarButtonStyle', 'dark'),
  ]);

  app.setImmersive(true);
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarHidden', true, 'fade'),
    call('setNavigationBarHidden', true),
    call('setHomeIndicatorAutoHidden', true),
    call('setScreenEdgesDeferred', true),
  ]);

  app.showBars(false);
  await app.settle();

  assert.deepEqual(app.sent(), [
    call('setStatusBarHidden', false, 'none'),
    call('setBackgroundColor', null),
    call('setNavigationBarColor', '#00000000'),
    call('setNavigationBarButtonStyle', 'default'),
    call('setNavigationBarHidden', false),
    call('setHomeIndicatorAutoHidden', false),
    call('setScreenEdgesDeferred', false),
  ]);
});

test('a SystemBars mounted after immersive shows the status bar it hid', async () => {
  const app = await launch();

  app.showBars(true);
  app.setImmersive(true);
  await app.settle();
  app.sent();
  app.showStatusBar(true);
  await app.settle();

  assert.deepEqual(app.sent(), [call('setStatusBarHidden', false, 'none')]);
});
