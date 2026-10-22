import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from 'ink-testing-library';
import { createSessionStore } from '../src/cli/session/store.ts';
import { DevicePicker, SessionView } from '../src/cli/session/view.ts';
import { filterDevices } from '../src/cli/devices.ts';
import type { SessionActions } from '../src/cli/session/view.ts';
import { fixtureDevice } from './support/cli.ts';
import { present } from './support/present.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 40));
const cwd = '/work/kuito';
const entry = '/work/kuito/demo/component-app.tsx';
const ESC = '\u001B';
const ENTER = '\r';
const frameOf = (app: { lastFrame(): string | undefined }) =>
  present(app.lastFrame(), 'rendered frame');

function session() {
  const store = createSessionStore({ entry, now: () => new Date(2026, 9, 17, 2, 5, 14).getTime() });
  const calls: (string | symbol)[] = [];
  // Every action records its name, whichever one the view asks for.
  const actions = new Proxy<SessionActions>({} as never, {
    get: (_target, name) => () => calls.push(name),
  });
  const app = render(h(SessionView, { store, actions, cwd }));

  return { store, calls, app };
}

test('the session shows settled steps, live patches and the shortcut bar', async () => {
  const { store, app } = session();

  store.dispatch({
    type: 'target',
    device: fixtureDevice({ name: 'iPhone 18 Pro', detail: 'iOS 27.0', platform: 'ios' }),
  });

  store.dispatch({ type: 'step:start', id: 'build', label: 'Native app built' });
  await tick();
  assert.match(frameOf(app), /Native app built/);
  store.dispatch({ type: 'step:end', id: 'build', ok: true, ms: 4200 });
  store.dispatch({ type: 'connected' });

  store.dispatch({
    type: 'patched',
    revision: 2,
    ms: 38,
    files: [entry],
    initial: false,
    delivered: 1,
  });

  await tick();

  const frame = frameOf(app);

  assert.match(frame, /kuito dev\s+iPhone 18 Pro · iOS 27\.0/);
  assert.match(frame, /✔ Native app built\s+4\.2s/);
  assert.match(frame, /02:05:14\s+✔ patched\s+demo\/component-app\.tsx\s+rev 2 · 38ms/);
  assert.match(frame, /r relaunch/);
  assert.match(frame, /q quit/);
  app.unmount();
});

test('single keys trigger their action; other keys are ignored', async () => {
  const { calls, app } = session();

  await tick();

  for (const key of ['r', 'x', '?', 'q']) {
    app.stdin.write(key);
    await tick();
  }

  assert.deepEqual(calls, ['relaunch', 'help', 'quit']);
  app.unmount();
});

test('help lists every shortcut, including the ones hidden from the bar', async () => {
  const { store, app } = session();

  store.dispatch({ type: 'help' });
  await tick();
  assert.match(frameOf(app), /u\s+Debug the UI-thread runtime/);
  app.unmount();
});

const devices = [
  fixtureDevice({
    id: 'A',
    name: 'iPhone 16 Pro',
    detail: 'iOS 18.2',
    active: true,
    platform: 'ios',
  }),
  fixtureDevice({
    id: 'B',
    name: 'iPhone 18 Pro',
    detail: 'iOS 27.0',
    active: false,
    platform: 'ios',
  }),
  fixtureDevice({
    id: 'C',
    name: 'iPhone 18 Pro Max',
    detail: 'iOS 27.0',
    active: false,
    platform: 'ios',
  }),
  fixtureDevice({
    id: 'D',
    name: 'Pixel_9',
    detail: 'Android Virtual Device',
    active: false,
    platform: 'android',
  }),
];

test('device filter matches every word against name and runtime', () => {
  assert.deepEqual(
    filterDevices(devices, '18 pro 27').map((d) => d.id),
    ['B', 'C'],
  );

  assert.deepEqual(
    filterDevices(devices, 'android').map((d) => d.id),
    ['D'],
  );

  assert.deepEqual(
    filterDevices(devices, '  ').map((d) => d.id),
    ['A', 'B', 'C', 'D'],
  );
});

function picker() {
  const picked: string[] = [];
  const app = render(
    h(DevicePicker, {
      devices,
      onSelect: (device) => picked.push(device.id),
      onCancel: () => picked.push('cancel'),
    }),
  );

  return { app, picked };
}

test('typing narrows the device list and enter picks the highlighted one', async () => {
  const { app, picked } = picker();

  await tick();
  assert.match(frameOf(app), /iPhone 16 Pro\s+iOS 18\.2\s+● booted/);
  app.stdin.write('18 max');
  await tick();
  assert.doesNotMatch(frameOf(app), /iPhone 16 Pro/);
  app.stdin.write(ENTER);
  await tick();
  assert.deepEqual(picked, ['C']);
  app.unmount();
});

test('arrow keys move the selection; escape cancels', async () => {
  const { app, picked } = picker();

  await tick();
  app.stdin.write(`${ESC}[B`);
  await tick();
  app.stdin.write(ENTER);
  await tick();
  assert.deepEqual(picked, ['B']);

  const second = picker();

  await tick();
  second.app.stdin.write(ESC);
  await tick();
  assert.deepEqual(second.picked, ['cancel']);
  app.unmount();
  second.app.unmount();
});

test('while picking, keys drive the picker instead of the session shortcuts', async () => {
  const { store, app } = session();
  const selected: string[] = [];

  app.rerender(
    h(SessionView, {
      store,
      cwd,
      // Only the picker's actions: no other one may fire while picking.
      actions: {
        select: (device) => selected.push(device.id),
        cancelPick: () => selected.push('cancel'),
        quit: () => selected.push('quit'),
      } satisfies Partial<SessionActions> as never,
    }),
  );

  store.dispatch({ type: 'pick', devices, message: 'Run on which device?' });
  await tick();
  assert.match(frameOf(app), /Run on which device\?/);
  app.stdin.write('q');
  await tick();
  assert.deepEqual(selected, [], 'q is filter text while picking, not quit');
  app.stdin.write('\u007F');
  await tick();
  app.stdin.write('pixel');
  await tick();
  app.stdin.write(ENTER);
  await tick();
  assert.deepEqual(selected, ['D']);
  app.unmount();
});

test('step durations line up in one column', async () => {
  const { store, app } = session();

  const steps: [id: string, label: string, ms: number][] = [
    ['boot', 'Simulator booted', 138],
    ['server', 'Live Patch on :8765', 68],
  ];

  for (const [id, label, ms] of steps) {
    store.dispatch({ type: 'step:start', id, label });
    store.dispatch({ type: 'step:end', id, ok: true, ms });
  }

  await tick();

  const lines = frameOf(app).split('\n');
  const column = (pattern: string) =>
    present(
      lines.find((line) => line.includes(pattern)),
      pattern,
    ).search(/\d+ms/);

  assert.equal(column('Simulator booted'), column('Live Patch on'));
  app.unmount();
});

test('stopping leaves a final line and removes the shortcut bar', async () => {
  const { store, app } = session();

  store.dispatch({ type: 'stopped' });
  await tick();
  assert.doesNotMatch(frameOf(app), /q quit/);
  assert.match(frameOf(app), /Stopped/);
  app.unmount();
});

test('each connected device shows its state under the feed; none are shown without devices', async () => {
  const { store, app } = session();

  store.dispatch({ type: 'connected' });
  await tick();
  assert.doesNotMatch(frameOf(app), /iPhone 18 Pro/);

  const phone = { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' };

  store.dispatch({ type: 'device:connected', device: phone });

  store.dispatch({
    type: 'patched',
    revision: 3,
    ms: 40,
    files: [entry],
    initial: false,
    delivered: 1,
  });

  store.dispatch({ type: 'device:applied', device: phone, revision: 3, ms: 9, latency: 150 });
  await tick();

  const frame = frameOf(app);
  const status = present(
    frame.split('\n').find((line) => line.includes('● iPhone 18 Pro')),
    'device line',
  );

  assert.match(status, /● iPhone 18 Pro\s+rev 3 applied · 150ms from save/);
  app.unmount();
});
