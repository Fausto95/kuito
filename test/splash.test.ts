import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { flushed, installKernel, type Props } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// The splash as an app hides and hands off from it, against a fake platform
// that answers like the iOS and Android Splash modules.

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Layout {
  logo: Frame;
  brand: Frame | null;
}

interface App {
  splash: {
    hold(): void;
    hide(options?: { fade?: boolean }): Promise<void>;
    readonly visible: { readonly value: boolean };
    layout(): Layout | null;
    variant: { value: string | null };
  };
  ready: string[];
  scale: { value: number };
  dismiss(): void;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-splash-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/splash-app.tsx');

const tick = () => new Promise<void>((done) => setTimeout(done, 0));

const LAYOUT: Layout = {
  logo: { x: 136.5, y: 396, width: 120, height: 60 },
  brand: { x: 96.5, y: 712, width: 200, height: 80 },
};

interface Platform {
  layout?: unknown;
  visible?: boolean;
  variant?: string | null;
}

function splashModule({ layout = LAYOUT, visible = true, variant = null }: Platform) {
  const state = { visible, layout };
  const module: FakeModule = {
    functions: {
      layout: { thread: 'js', run: () => state.layout },
      visible: { thread: 'js', run: () => state.visible },
      preventAutoHide: { thread: 'js', run: () => null },
      getVariant: { thread: 'js', run: () => variant },
      hide: {
        thread: 'main',
        run: () => {
          state.visible = false;

          return null;
        },
      },
      setVariant: { thread: 'main', run: () => null },
    },
    view: { events: [] },
  };

  return { modules: { Splash: module }, state };
}

async function launch(platform: Platform = {}) {
  const { modules, state } = splashModule(platform);
  const native = fakeModules(modules);
  const views = new Map<string, { kind: string; parent: string; props: Props }>();
  const kernel = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        const view = views.get(id);

        if (view) view.props[name] = value;
      },
      // Removing a view takes its subtree with it, as on the platforms.
      removeView(id: string) {
        const removed = [id];

        for (const gone of removed) {
          views.delete(gone);

          for (const [child, view] of views) if (view.parent === gone) removed.push(child);
        }
      },
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  const app = kernel as unknown as App;
  /** The views of the splash module, by the part they draw, in creation order. */
  const parts = () =>
    [...views.entries()]
      .filter(([, view]) => view.kind === 'module:Splash')
      .map(([id, view]) => ({ id, ...view }));
  const part = (name: string) => {
    const found = parts().find((view) => view.props.part === name);

    assert.ok(found, `the ${name} part is drawn`);

    return found;
  };
  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    await tick();
    native.flush();
    await tick();
  };

  return { ...native, app, views, parts, part, flush, platform: state };
}

test('SplashScreen draws the launch screen again, where the native side reports it', async () => {
  const splash = await launch();
  const background = splash.part('background');
  const logo = splash.part('logo');
  const brand = splash.part('brand');

  assert.deepEqual(
    splash.parts().map((view) => view.props.part),
    ['background', 'logo', 'brand'],
    'drawn back to front, as the launch screen is',
  );

  assert.deepEqual(
    [background.props.position, background.props.left, background.props.top],
    ['absolute', 0, 0],
  );

  assert.deepEqual([background.props.right, background.props.bottom], [0, 0]);

  assert.deepEqual(
    [logo.props.left, logo.props.top, logo.props.width, logo.props.height],
    [136.5, 396, 120, 60],
  );

  assert.deepEqual(
    [brand.props.left, brand.props.top, brand.props.width, brand.props.height],
    [96.5, 712, 200, 80],
  );

  const screen = splash.views.get(logo.parent);

  assert.ok(screen, 'the parts share one view');
  assert.equal(background.parent, logo.parent);
  assert.equal(screen.props.position, 'absolute');
  assert.equal(screen.props.opacity, 0.5, 'its own props animate the whole splash');
  assert.equal(brand.props.opacity, 0.25, 'and the parts take theirs');

  const message = [...splash.views.values()].find((view) => view.props.text === 'Loading…');

  assert.ok(message, 'live content renders over the launch screen');
});

test('the logo moves with the motion values the app gives it', async () => {
  const splash = await launch();

  assert.equal(splash.part('logo').props.scale, 1);
  splash.app.scale.value = 1.4;
  await flushed();
  assert.equal(splash.part('logo').props.scale, 1.4);
});

test('onReady runs once the native splash hides, and only once', async () => {
  const splash = await launch();

  assert.deepEqual(data(splash.app.ready), []);
  assert.deepEqual(splash.observed, ['start Splash.visible']);

  splash.emit('Splash', 'visible', false);
  splash.emit('Splash', 'visible', false);
  await tick();

  assert.deepEqual(data(splash.app.ready), ['ready']);
});

test('a SplashScreen that mounts after the native splash hid is ready at once', async () => {
  const splash = await launch({ visible: false });

  await tick();
  assert.deepEqual(data(splash.app.ready), ['ready']);
  assert.equal(splash.parts().length, 3, 'it still draws, for the app to animate away');
});

test('removing the SplashScreen stops listening for the native splash', async () => {
  const splash = await launch();

  splash.app.dismiss();
  await tick();

  assert.deepEqual(splash.parts(), []);
  assert.deepEqual(splash.observed, ['start Splash.visible', 'stop Splash.visible']);
});

test('without a splash in kuito.config.ts, SplashScreen draws nothing and is ready', async () => {
  const splash = await launch({ layout: null });

  assert.deepEqual(splash.parts(), []);
  assert.deepEqual(data(splash.app.ready), ['ready']);
});

test('a layout the platform should never report is an error', async () => {
  const splash = await launch({ visible: false });

  assert.deepEqual(data(splash.app.splash.layout()), LAYOUT);

  for (const layout of [
    { logo: 'center', brand: null },
    { logo: { x: 0, y: 0, width: -1, height: 1 }, brand: null },
    { logo: LAYOUT.logo },
  ]) {
    splash.platform.layout = layout;
    assert.throws(() => splash.app.splash.layout(), /splash: invalid layout from the platform/);
  }
});

test('splash.hide fades only when asked, and settles once the native splash is gone', async () => {
  const splash = await launch();
  const hidden = splash.app.splash.hide();

  await splash.flush();
  await hidden;
  void splash.app.splash.hide({ fade: true });
  await splash.flush();
  // The platform reports the splash gone.
  splash.emit('Splash', 'visible', false);

  assert.deepEqual(
    splash.calls.filter((call) => call.method === 'hide').map((call) => call.args),
    [[false], [true]],
  );

  assert.equal(splash.app.splash.visible.value, false);
});

test('splash.hold keeps the native splash up until the app hides it', async () => {
  const splash = await launch();

  splash.app.splash.hold();

  assert.deepEqual(
    splash.calls.filter((call) => call.method === 'preventAutoHide').map((call) => call.args),
    [[]],
  );
});

test('splash.variant starts as this launch’s and picks the next launch’s', async () => {
  const splash = await launch({ variant: 'holiday' });

  assert.equal(splash.app.splash.variant.value, 'holiday');

  splash.app.splash.variant.value = 'summer';
  assert.equal(splash.app.splash.variant.value, 'summer');
  splash.app.splash.variant.value = null;
  await splash.flush();

  assert.deepEqual(
    splash.calls.filter((call) => call.method === 'setVariant').map((call) => call.args),
    [['summer'], [null]],
  );
});
