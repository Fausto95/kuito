import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { compileApp, compileEditedApp } from './support/live-patch.ts';
import { linkedFunction } from './support/fake-modules.ts';
import { installUIKernel } from './support/ui-host.ts';
import { installKernel } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';

async function compile(fixture: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-motion-'));

  try {
    return await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(fixture));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/**
 * The compiled app on two threads, connected as a native host connects them:
 * UI operations and scripts go to the UI kernel, its events to the kernel.
 */
async function run(fixture: string, uiGlobals: object = {}) {
  const { code } = await compile(fixture);
  const ui = installUIKernel(uiGlobals);
  const props = new Map<string, unknown>();
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        props.set(id + '.' + name, value);
      },
      removeView() {},
      ui: (operations: unknown[]) => ui.ui.receive(structuredClone(operations)),
      uiScript(source: string) {
        ui.load(source);
      },
      __kuitoHostMotionRead: (id: string) => ui.mirror.get(id),
    }),
  );

  runInNewContext(code, kernel);
  await new Promise((settled) => setImmediate(settled));

  const scroll = async (y: number) => {
    assert.equal(
      ui.ui.event(handleOf(kernel.__kuito, 'feed'), 'scroll', JSON.stringify({ y })),
      true,
      'scroll runs on the UI thread',
    );

    for (const message of ui.sent.splice(0))
      kernel.__kuito.dispatch(0, 'ui', JSON.stringify(message));

    await new Promise((settled) => setImmediate(settled));
  };

  // The UI thread's latest write per prop wins over the JS thread's.
  const shown = (key: string) => {
    const dot = key.lastIndexOf('.');
    const view = handleOf(kernel.__kuito, key.slice(0, dot));
    const written = ui.props.filter(([id, prop]) => id === view && prop === key.slice(dot + 1));

    return written.length ? written[written.length - 1][2] : props.get(key);
  };

  /** Display frames from `start` for `ms`, delivering UI-thread messages to the JS thread. */
  const frames = async (start: number, ms: number) => {
    for (let now = start; now <= start + ms; now += 1000 / 60) {
      ui.ui.frame(now);

      for (const message of ui.sent.splice(0))
        kernel.__kuito.dispatch(0, 'ui', JSON.stringify(message));
    }

    await new Promise((settled) => setImmediate(settled));
  };

  return { ui, kernel, props, scroll, shown, frames };
}

test('a compiled app moves views on the UI thread as it scrolls', async () => {
  const app = await run('test/fixtures/motion-app.tsx');

  assert.equal(app.shown('header.opacity'), 1);
  assert.equal(app.props.has('header.opacity'), false, 'the JS thread never writes it');

  await app.scroll(100);

  assert.equal(app.shown('header.opacity'), 0.5);
  assert.equal(app.shown('header.translateY'), -50);
  assert.equal(app.shown('label.text'), 'top');

  await app.scroll(180);

  assert.equal(
    app.shown('label.text'),
    'scrolled',
    'the label follows its signal on the UI thread',
  );
});

test('an animation started by a press runs on the UI thread and its onEnd reaches the JS thread', async () => {
  const app = await run('test/fixtures/spin-app.tsx');

  nativeEvent(app.kernel.__kuito, 'spin.press');
  await new Promise((settled) => setImmediate(settled));
  await app.frames(0, 350);

  assert.ok(Number(app.shown('badge.rotate')) > 0, 'the badge turns');
  assert.equal(app.shown('laps.text'), '3 laps');
});

test('an animation started on mount updates text that reads it conditionally', async () => {
  const app = await run('test/fixtures/spin-on-mount-app.tsx');

  await app.frames(0, 350);

  assert.equal(app.shown('laps.text'), '3 laps');
});

test('a dragged view follows the finger with no handler and no round trip, and springs back', async () => {
  const app = await run('test/fixtures/drag-app.tsx');
  const gestures = app.props.get('card.gestures') as { tag: number }[];

  assert.equal(gestures.length, 1);

  const tag = gestures[0].tag;
  const drag = (payload: object) =>
    app.ui.ui.event(
      handleOf(app.kernel.__kuito, 'card'),
      'gesture',
      JSON.stringify({ handlerTag: tag, numberOfPointers: 1, pointerType: 0, ...payload }),
    );
  const before = app.kernel.__kuito.stats().total.uiMessages;

  drag({ state: 2, oldState: 0 });
  drag({ state: 4, oldState: 2 });
  drag({ state: 4, translationX: 40 });
  drag({ state: 4, translationX: 100 });

  assert.equal(app.shown('card.translateX'), 100, 'it follows the finger');
  assert.equal(app.shown('card.opacity'), 0.75, 'interpolated on the UI thread');
  assert.equal(app.shown('card.rotate'), 10, 'mapped on the UI thread');

  drag({ state: 5, oldState: 4, velocityX: 300 });
  await app.frames(0, 3000);

  assert.equal(app.shown('card.translateX'), 0, 'it springs back');
  assert.deepEqual(app.ui.sent, [], 'the UI thread sent nothing');
  assert.equal(app.kernel.__kuito.stats().total.uiMessages, before, 'no __kuito.ui round trip');
});

test('the UI bundle is named by its content and written beside the patch', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-motion-'));

  try {
    const compile = createSourceCompiler({ platform: 'ios', outputDir: temp });
    const { code } = await compile(resolve('test/fixtures/spin-app.tsx'));
    const [, source = '""', url = ''] =
      /__kuito\.loadUI\(("(?:[^"\\]|\\.)*"), "(kuito:\/\/ui\/[0-9a-f]{12})"\)/.exec(code) ?? [];

    assert.ok(url, 'loadUI names the bundle');
    // The dev server answers DevTools' request for the bundle's source from this file.

    assert.equal(
      readFileSync(join(temp, `ui-${url.slice('kuito://ui/'.length)}.js`), 'utf8'),
      JSON.parse(source),
    );

    const again = await compile(resolve('test/fixtures/spin-app.tsx'));

    assert.ok(again.code.includes(url), 'the same functions keep the same name');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('200 Live Patches of the gestures demo leave what both threads hold flat', async () => {
  const versions = [
    await compileEditedApp('demo/gestures.tsx'),
    await compileApp('demo/gestures.tsx'),
  ];
  const ui = installUIKernel();
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      ui: (operations: unknown[]) => ui.ui.receive(structuredClone(operations)),
      uiScript(source: string) {
        ui.load(source);
      },
      __kuitoHostMotionRead: (id: string) => ui.mirror.get(id),
    }),
  );
  const held = () => ({ js: kernel.__kuito.stats().held, ui: ui.ui.stats() });
  const patch = async (index: number) => {
    runInNewContext(versions[index % 2], kernel);
    await new Promise((settled) => setImmediate(settled));
  };

  await patch(0);

  const before = held();

  for (let index = 1; index < 200; index++) await patch(index);

  assert.ok(
    before.ui.handlers > 0 && before.ui.motions > 0 && before.ui.functions > 0,
    JSON.stringify(before),
  );

  assert.deepEqual(held(), before);
});

test('a UI-thread handler calls a main-thread module function directly, with nothing for the JS thread', async () => {
  const called: unknown[][] = [];
  const app = await run('test/fixtures/haptic-scroll-app.tsx', {
    // As native/shared/UIRuntime.cpp answers: the platform runs it on this thread.
    __kuitoUIHostCall(id: number, ...args: unknown[]) {
      called.push([linkedFunction(id).join('.'), ...args]);

      return null;
    },
  });

  assert.equal(
    app.ui.ui.event(handleOf(app.kernel.__kuito, 'feed'), 'scroll', JSON.stringify({ y: 120 })),
    true,
    'the handler runs on the UI thread',
  );

  assert.deepEqual(JSON.parse(JSON.stringify(called)), [['Haptics.impact', 'light']]);
  assert.deepEqual(app.ui.sent, [], 'no JS-thread event');
});

test('a Pressable toggling opacity never crosses a thread', async () => {
  const app = await run('test/fixtures/toggle-app.tsx');
  const work = () => {
    const { total } = app.kernel.__kuito.stats();

    return { sent: total.sendPropCalls, messages: total.uiMessages };
  };

  assert.equal(app.shown('toggle.opacity'), 0.5);
  assert.equal(app.shown('toggle-taps.text'), '0 taps');

  const before = work();
  const toggle = handleOf(app.kernel.__kuito, 'toggle');

  assert.equal(app.ui.ui.event(toggle, 'press', '{}'), true, 'the press runs on the UI thread');
  assert.equal(app.shown('toggle.opacity'), 1);
  assert.equal(app.shown('toggle-taps.text'), '1 taps');

  assert.equal(app.ui.ui.event(toggle, 'press', '{}'), true);
  assert.equal(app.shown('toggle.opacity'), 0.5);
  assert.equal(app.shown('toggle-taps.text'), '2 taps');

  assert.deepEqual(app.ui.sent, [], 'nothing goes back to the JS thread');
  assert.deepEqual(work(), before, 'and the JS thread does nothing');
});

test('a computed placed with its component updates on the UI thread', async () => {
  const app = await run('test/fixtures/counter-app.tsx');
  const before = app.kernel.__kuito.stats().total;

  assert.equal(app.shown('counter.opacity'), 0.2);
  assert.equal(app.shown('doubled.text'), '2 doubled');

  assert.equal(
    app.ui.ui.event(handleOf(app.kernel.__kuito, 'counter'), 'press', '{}'),
    true,
    'the press runs on the UI thread',
  );

  assert.equal(app.shown('counter.opacity'), 0.4);
  assert.equal(app.shown('doubled.text'), '4 doubled');

  const after = app.kernel.__kuito.stats().total;

  assert.deepEqual(app.ui.sent, [], 'nothing goes back to the JS thread');
  assert.equal(after.sendPropCalls, before.sendPropCalls, 'the JS thread sent nothing');
});

test("the gestures demo's counters count on the UI thread, with nothing for the JS thread", async () => {
  const app = await run('demo/gestures.tsx');
  const gestures = app.props.get('badge.gestures') as {
    tag: number;
    type: string;
    config: Record<string, unknown>;
  }[];
  // The single tap: a tap without a count of two.
  const single = gestures.find(({ type, config }) => type === 'tap' && config.numberOfTaps !== 2);

  assert.ok(single);

  const tap = (payload: object) =>
    app.ui.ui.event(
      handleOf(app.kernel.__kuito, 'badge'),
      'gesture',
      JSON.stringify({ handlerTag: single.tag, numberOfPointers: 1, pointerType: 0, ...payload }),
    );
  const before = app.kernel.__kuito.stats().total;

  tap({ state: 2, oldState: 0 });
  tap({ state: 4, oldState: 2 });
  tap({ state: 5, oldState: 4 });

  assert.equal(app.shown('counts.text'), '1 taps · 0 double taps · 0 long presses');
  assert.deepEqual(app.ui.sent, []);

  const after = app.kernel.__kuito.stats().total;

  assert.equal(after.uiMessages, before.uiMessages, 'no __kuito.ui round trip');
  assert.equal(after.sendPropCalls, before.sendPropCalls, 'the JS thread sent nothing');
});

test('an inherited motion value binds on the UI thread; an inherited signal stays a JS-thread read', async () => {
  const app = await run('test/fixtures/inherited-app.tsx');

  assert.equal(app.shown('header.opacity'), 1);

  await app.scroll(100);

  assert.equal(app.shown('header.opacity'), 0.5);
  assert.equal(app.props.has('header.opacity'), false, 'the JS thread never writes it');

  const like = handleOf(app.kernel.__kuito, 'like');

  assert.equal(app.shown('like-label.text'), 'teal');
  assert.equal(app.ui.ui.event(like, 'press', '{}'), true, 'Like stays placed whole');
  assert.equal(app.shown('like.opacity'), 1);
  assert.deepEqual(app.ui.sent, [], 'nothing goes back to the JS thread');

  nativeEvent(app.kernel.__kuito, 'recolor.press');
  await new Promise((settled) => setImmediate(settled));

  assert.equal(app.shown('like-label.text'), 'orange', 'the JS thread re-sends what read it');
});
