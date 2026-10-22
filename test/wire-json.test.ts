import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import type { HeadlessHost, WireWork } from '../src/tests/host.ts';
import { press, scroll } from '../src/tests/interactions.ts';
import { headlessApp } from './support/headless.ts';

// What crosses the runtimes' boundaries as JSON while an app scrolls, drags
// and updates a list, on the headless host (docs/performance.md#json-at-the-boundary):
// nothing, since typed events (plan 2.5) and plain data (plan 2.6).

const FRAME = 1000 / 60;
const STEPS = 30;

const fixture = (name: string) => join(ROOT, 'test/fixtures', name);

/** The work `interact` did on `host`, each counter its growth. */
async function measured(host: HeadlessHost, interact: () => Promise<void>): Promise<WireWork> {
  const before = host.wireWork();

  await interact();

  const after = host.wireWork();

  return {
    frames: after.frames - before.frames,
    bytesStringified: after.bytesStringified - before.bytesStringified,
    jsonParses: {
      kernel: after.jsonParses.kernel - before.jsonParses.kernel,
      ui: after.jsonParses.ui - before.jsonParses.ui,
      renderer: after.jsonParses.renderer - before.jsonParses.renderer,
    },
  };
}

const viewNamed = (host: HeadlessHost, label: string) => {
  const found = [...host.renderer.views.values()].find((view) => view.label === label);

  assert.ok(found, `a view labelled ${label}`);

  return found;
};

test('a scroll crosses no JSON: its events and the rows it binds arrive typed', async () => {
  const host = await headlessApp(fixture('wire/scroll-app.tsx'));
  const feed = viewNamed(host, 'feed');

  const work = await measured(host, async () => {
    for (let step = 1; step <= STEPS; step++) {
      await scroll(host, feed, { y: step * 40 });
      await host.advance(FRAME);
    }
  });

  assert.deepEqual(work, {
    frames: STEPS,
    bytesStringified: 0,
    jsonParses: { kernel: 0, ui: 0, renderer: 0 },
  });
});

test('a scroll motion source crosses no JSON: offsets reach the UI thread as numbers', async () => {
  const host = await headlessApp(fixture('scroll-motion-app.tsx'));
  const feed = viewNamed(host, 'feed');

  const work = await measured(host, async () => {
    for (let step = 1; step <= STEPS; step++) {
      await scroll(host, feed, { y: step * 40 });
      await host.advance(FRAME);
    }
  });

  assert.deepEqual(work, {
    frames: STEPS,
    bytesStringified: 0,
    jsonParses: { kernel: 0, ui: 0, renderer: 0 },
  });
});

test('the keyboard moving crosses no JSON: its height reaches the UI thread as a number', async () => {
  const host = await headlessApp(fixture('keyboard-motion-app.tsx'));

  const work = await measured(host, async () => {
    for (let step = 1; step <= STEPS; step++) {
      host.dispatch(0, 'keyboard.move', { height: step * 10 });
      await host.advance(FRAME);
    }
  });

  assert.deepEqual(work, {
    frames: STEPS,
    bytesStringified: 0,
    jsonParses: { kernel: 0, ui: 0, renderer: 0 },
  });
});

test('a drag crosses no JSON: its gesture events arrive typed on the UI thread', async () => {
  const host = await headlessApp(fixture('drag-app.tsx'));
  const card = viewNamed(host, 'card');
  const gestures: unknown = card.props.get('gestures');

  assert.ok(Array.isArray(gestures) && gestures.length === 1);

  const tag: unknown = gestures[0].tag;
  const drag = (payload: object) =>
    host.dispatch(card.id, 'gesture', {
      handlerTag: tag,
      numberOfPointers: 1,
      pointerType: 0,
      ...payload,
    });

  const work = await measured(host, async () => {
    drag({ state: 2, oldState: 0 });
    drag({ state: 4, oldState: 2 });

    for (let step = 1; step <= STEPS; step++) {
      drag({ state: 4, translationX: step * 5 });
      await host.advance(FRAME);
    }

    drag({ state: 5, oldState: 4, velocityX: 0 });
    await host.settle();
  });

  assert.deepEqual(work, {
    frames: STEPS,
    bytesStringified: 0,
    jsonParses: { kernel: 0, ui: 0, renderer: 0 },
  });
});

test('a list update crosses no JSON: the press arrives typed, the rows as plain data', async () => {
  const host = await headlessApp(fixture('wire/list-app.tsx'));
  const update = viewNamed(host, 'update');

  const work = await measured(host, async () => {
    await press(host, update);
    await host.advance(FRAME);
  });

  assert.deepEqual(work, {
    frames: 1,
    bytesStringified: 0,
    jsonParses: { kernel: 0, ui: 0, renderer: 0 },
  });
});
