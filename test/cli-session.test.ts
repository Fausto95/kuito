import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { createSessionState, reduceSession, type SessionEvent } from '../src/cli/session/state.ts';
import {
  describeItem,
  formatClock,
  formatMs,
  plainLines,
  SHORTCUTS,
  shortcutAction,
} from '../src/cli/session/format.ts';
import type { Crash } from '../src/cli/crash.ts';
import { fixtureDevice } from './support/cli.ts';
import { present } from './support/present.ts';

const at = new Date(2026, 9, 17, 2, 5, 14).getTime();
const cwd = '/work/kuito';
const entry = '/work/kuito/demo/component-app.tsx';
const run = (...events: SessionEvent[]) =>
  events.reduce(reduceSession, createSessionState({ entry }));
const kinds = (state: ReturnType<typeof run>) => state.feed.map((item) => item.kind);

test('a step runs live, then settles into the feed with its duration', () => {
  const running = run({
    type: 'step:start',
    id: 'build',
    label: 'Native app built',
    detail: 'ios · Debug',
  });

  assert.deepEqual(
    running.running.map((step) => step.label),
    ['Native app built'],
  );

  const done = reduceSession(running, { type: 'step:end', id: 'build', ok: true, ms: 4200 });

  assert.deepEqual(done.running, []);

  assert.deepEqual(describeItem(present(done.feed.at(-1), 'last feed item'), { cwd }), {
    icon: '✔',
    tone: 'success',
    title: 'Native app built',
    meta: '4.2s',
    detail: [],
  });
});

const phone = { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' };
const pixel = { id: 'P9', name: 'Pixel 9', platform: 'android' };
const patched = (
  revision: number,
  files: string[],
  extra: { initial?: boolean; delivered?: number } = {},
) =>
  ({
    type: 'patched',
    revision,
    ms: 38,
    files,
    initial: false,
    delivered: 1,
    at,
    ...extra,
  }) as const;

test('the initial build is part of startup; later edits become patch lines', () => {
  const state = run({ ...patched(1, [], { initial: true }), ms: 120 }, patched(2, [entry]));

  assert.deepEqual(kinds(state), ['patch']);
  assert.equal(state.revision, 2);

  assert.deepEqual(describeItem(state.feed[0], { cwd }), {
    time: '02:05:14',
    icon: '✔',
    tone: 'success',
    title: 'patched',
    subject: 'demo/component-app.tsx',
    meta: 'rev 2 · 38ms',
    detail: [],
  });
});

test('a patch with no edited files and no known entry is described without a subject', () => {
  const state = run(patched(2, []), { type: 'rejected', ms: 5, files: [], at });
  const views = state.feed.map((item) => describeItem(item, { cwd }));

  assert.deepEqual(
    views.map(({ title, subject }) => ({ title, subject })),
    [
      { title: 'patched', subject: undefined },
      { title: 'rejected', subject: undefined },
    ],
  );
});

test('a rejected edit points at the source location and says the last version stays live', () => {
  const state = run({
    type: 'rejected',
    ms: 12,
    files: [entry],
    at,
    diagnostics: [
      {
        message: 'Unexpected token',
        file: entry,
        line: 12,
        column: 4,
        frame: ' 12 |   return (,\n    :          ^',
      },
    ],
  });
  const view = describeItem(state.feed[0], { cwd });

  assert.equal(view.tone, 'error');
  assert.equal(view.title, 'rejected');
  assert.equal(view.subject, 'demo/component-app.tsx:12:4');

  assert.deepEqual(view.detail, [
    { text: 'Unexpected token' },
    { text: ' 12 |   return (,', tone: 'muted' },
    { text: '    :          ^', tone: 'muted' },
    { text: 'previous version stays live', tone: 'muted' },
  ]);
});

test('a crash is shown with its cause and frames, and offers a relaunch', () => {
  const crash: Crash = {
    pid: undefined,
    process: 'KuitoIOS',
    exception: 'EXC_BREAKPOINT',
    signal: 'SIGTRAP',
    messages: [],
    frames: [{ image: 'UIKitCore', symbol: 'boom' }],
    report: '/r.ips',
  };
  const state = run({ type: 'app', status: 'crashed', crash, at });

  assert.equal(state.app, 'crashed');

  const view = describeItem(state.feed[0], { cwd });

  assert.equal(view.title, 'KuitoIOS crashed');
  assert.equal(view.meta, 'EXC_BREAKPOINT · SIGTRAP');

  assert.deepEqual(
    view.detail.map((line) => line.text),
    ['UIKitCore  boom', 'Full report: /r.ips', 'press r to rebuild and relaunch'],
  );
});

test('connecting announces what is live and where', () => {
  const state = run(
    {
      type: 'target',
      device: fixtureDevice({ name: 'iPhone 18 Pro', detail: 'iOS 27.0', platform: 'ios' }),
    },
    { type: 'connected' },
  );

  assert.equal(state.app, 'running');
  assert.deepEqual(kinds(state), ['title', 'live']);
  assert.equal(describeItem(state.feed[0], { cwd }).title, 'kuito dev');
  assert.equal(describeItem(state.feed[0], { cwd }).meta, 'iPhone 18 Pro · iOS 27.0');

  assert.equal(
    describeItem(state.feed[1], { cwd }).subject,
    'demo/component-app.tsx → iPhone 18 Pro',
  );
});

test('feed ids stay unique after clearing, so the renderer never reuses a key', () => {
  const before = run({ type: 'log', stream: 'stderr', text: 'one' });
  const cleared = reduceSession(before, { type: 'clear' });

  assert.deepEqual(cleared.feed, []);

  const after = reduceSession(cleared, { type: 'log', stream: 'stderr', text: 'two' });

  assert.notEqual(after.feed[0].id, before.feed[0].id);
});

test('help and native logs are toggles; the logs toggle is announced', () => {
  const state = run({ type: 'help' }, { type: 'logs', on: true });

  assert.equal(state.help, true);
  assert.equal(state.logs, true);

  assert.equal(
    describeItem(present(state.feed.at(-1), 'last feed item'), { cwd }).title,
    'Device logs on',
  );

  assert.equal(run({ type: 'help' }, { type: 'help' }).help, false);
});

test('opening DevTools is announced with the target it debugs', () => {
  const [item] = run({ type: 'debugger', title: 'JS thread · iPhone 18 Pro' }).feed;

  const { title, meta } = describeItem(present(item, 'the note'), { cwd });

  assert.equal(title, 'Chrome DevTools');
  assert.equal(meta, 'JS thread · iPhone 18 Pro');
});

test('server events the CLI does not render leave state untouched', () => {
  const state = createSessionState({ entry });

  assert.strictEqual(reduceSession(state, { type: 'started' }), state);
});

test('durations and clock times read naturally', () => {
  assert.equal(formatMs(38), '38ms');
  assert.equal(formatMs(4200), '4.2s');
  assert.equal(formatMs(83_000), '1m 23s');
  assert.equal(formatClock(at), '02:05:14');
});

test('plain output renders the same description without colour', () => {
  const state = run(patched(2, [entry]));

  assert.deepEqual(plainLines(state.feed[0], { cwd }), [
    '02:05:14  ✔ patched  demo/component-app.tsx  rev 2 · 38ms',
  ]);
});

test('every shortcut maps one key to one action, and unknown keys do nothing', () => {
  assert.equal(new Set(SHORTCUTS.map((shortcut) => shortcut.key)).size, SHORTCUTS.length);
  assert.equal(shortcutAction('r'), 'relaunch');
  assert.equal(shortcutAction('q'), 'quit');
  // `m` (menu) opens the devtools on the device, as React Native's dev menu.
  assert.equal(shortcutAction('m'), 'devtools');
  // `j` debugs the JS thread in Chrome DevTools, as in React Native; `u` the UI thread.
  assert.equal(shortcutAction('j'), 'debugJS');
  assert.equal(shortcutAction('u'), 'debugUI');
  // `k` opens the Components panel, the app's binding graph.
  assert.equal(shortcutAction('k'), 'components');
  assert.equal(shortcutAction('x'), undefined);
});

test('picking a device is a session mode that ends once a device is chosen', () => {
  const devices = [fixtureDevice({ id: 'A', name: 'iPhone 18 Pro' })];
  const picking = run({ type: 'pick', devices, message: 'Run on which device?' });

  assert.deepEqual(picking.picker, { devices, message: 'Run on which device?' });
  assert.equal(reduceSession(picking, { type: 'picked' }).picker, null);
});

test('a failed step leads with the lines that name the error, not the stack or noise around it', () => {
  const output = [
    'xcodegen failed (1)',
    ...Array.from({ length: 5 }, (_, i) => `noise ${i + 1}`),
    'SpecParsingError: Decoding failed at "path": Nothing found (Swift.DecodingError)',
    ...Array.from({ length: 20 }, (_, i) => `        from frame ${i + 1}`),
  ].join('\n');
  const state = run(
    { type: 'step:start', id: 'build', label: 'Native app built' },
    { type: 'step:end', id: 'build', ok: false, ms: 900, message: output },
  );
  const view = describeItem(state.feed[0], { cwd });

  assert.equal(view.icon, '✖');

  assert.deepEqual(
    view.detail.map((line) => line.text),
    [
      'xcodegen failed (1)',
      'SpecParsingError: Decoding failed at "path": Nothing found (Swift.DecodingError)',
      '… 25 more lines · run with --verbose for the full output',
    ],
  );
});

test('a failed step without recognisable error lines shows the start of its output', () => {
  const output = [
    'xcodebuild failed (65)',
    ...Array.from({ length: 30 }, (_, i) => `line ${i + 1}`),
  ].join('\n');
  const state = run(
    { type: 'step:start', id: 'build', label: 'Native app built' },
    { type: 'step:end', id: 'build', ok: false, ms: 900, message: output },
  );
  const lines = describeItem(state.feed[0], { cwd }).detail.map((line) => line.text);

  assert.deepEqual(lines.slice(0, 3), ['xcodebuild failed (65)', 'line 1', 'line 2']);
  assert.equal(lines.at(-1), '… 18 more lines · run with --verbose for the full output');
  assert.equal(lines.length, 14);
});

test('a rejected edit without a line still says which file and which compiler it came from', () => {
  const state = run({
    type: 'rejected',
    ms: 5,
    files: [entry],
    at,
    diagnostics: [
      {
        message: 'padding must be a compile-time literal',
        file: '/work/kuito/demo/screens/overview.tsx',
        plugin: 'kuito-transform',
      },
    ],
  });
  const view = describeItem(state.feed[0], { cwd });

  assert.equal(view.subject, 'demo/screens/overview.tsx');

  assert.deepEqual(view.detail.at(-2), {
    text: 'reported by the Kuito compiler',
    tone: 'muted',
  });
});

test('a failed step with compile diagnostics shows where the error is, like a rejected edit', () => {
  const diagnostics = [
    {
      message: 'Kuito styles: color must be a compile-time literal',
      file: '/work/kuito/demo/showcase/screens/overview.tsx',
      line: 12,
      column: 19,
      frame: ' 12 |   title: { color: brand },\n    :                   ^',
      plugin: 'kuito-transform',
    },
  ];
  const state = run(
    { type: 'step:start', id: 'assets', label: 'On-device app compiled' },
    {
      type: 'step:end',
      id: 'assets',
      ok: false,
      ms: 80,
      message: 'ignored when diagnostics exist',
      diagnostics,
    },
  );
  const view = describeItem(state.feed[0], { cwd });

  assert.equal(view.icon, '✖');
  assert.equal(view.title, 'On-device app compiled');
  assert.equal(view.subject, 'demo/showcase/screens/overview.tsx:12:19');

  assert.deepEqual(
    view.detail.map((line) => line.text),
    [
      'Kuito styles: color must be a compile-time literal',
      ' 12 |   title: { color: brand },',
      '    :                   ^',
      'reported by the Kuito compiler',
    ],
  );
});

test('device console output reads like a log line, located in the source', () => {
  const state = run(
    {
      type: 'console',
      level: 'log',
      message: 'ready',
      file: 'demo/app.tsx',
      line: 8,
      column: 3,
      at,
    },
    { type: 'console', level: 'warn', message: 'slow list' },
    {
      type: 'console',
      level: 'error',
      message: 'Error: boom\nsecond line',
      file: 'demo/app.tsx',
      line: 4,
      column: 9,
    },
  );
  const [log, warn, error] = state.feed.map((item) => describeItem(item, { cwd }));

  assert.deepEqual(log, {
    time: formatClock(at),
    icon: '›',
    tone: 'normal',
    title: 'ready',
    subject: 'demo/app.tsx:8',
    detail: [],
  });

  assert.equal(warn?.tone, 'warning');
  assert.equal(warn?.subject, undefined);
  assert.equal(error?.tone, 'error');
  assert.equal(error?.title, 'Error: boom');
  assert.deepEqual(error?.detail, [{ text: 'second line', tone: 'muted' }]);
});

test('each device acks a patch: applied with the time from the save, or rejected', () => {
  const state = run(
    { type: 'device:connected', device: phone, at },
    { type: 'device:connected', device: pixel, at },
    patched(2, [entry], { delivered: 2 }),
    { type: 'device:applied', device: phone, revision: 2, ms: 12, latency: 182, at },
    {
      type: 'device:rejected',
      device: pixel,
      revision: 2,
      code: 'EVALUATION',
      message: 'x is not defined',
      at,
    },
  );

  assert.deepEqual(
    state.devices.map(({ device, status, revision }) => ({ name: device.name, status, revision })),
    [
      { name: 'iPhone 18 Pro', status: 'applied', revision: 2 },
      { name: 'Pixel 9', status: 'rejected', revision: 2 },
    ],
  );

  const [applied, rejected] = state.feed
    .filter((item) => item.kind === 'applied' || item.kind === 'refused')
    .map((item) => describeItem(item, { cwd }));

  assert.deepEqual(applied, {
    time: '02:05:14',
    icon: '✔',
    tone: 'success',
    title: 'applied',
    subject: 'demo/component-app.tsx → iPhone 18 Pro',
    meta: 'rev 2 · 182ms from save · eval 12ms',
    detail: [],
  });

  assert.equal(present(rejected, 'rejection').title, 'rejected on Pixel 9');

  assert.deepEqual(
    present(rejected, 'rejection').detail.map((line) => line.text),
    ['x is not defined', 'EVALUATION', 'previous version stays live'],
  );
});

test('with no device connected, a patch says so and no device reports it applied', () => {
  const state = run(patched(2, [entry], { delivered: 0 }));

  assert.deepEqual(state.devices, []);
  assert.deepEqual(kinds(state), ['patch']);
  assert.equal(describeItem(state.feed[0], { cwd }).meta, 'rev 2 · 38ms · no device connected');
});

test('the ack of a revision nobody edited, such as on connecting, updates the device but not the feed', () => {
  const state = run(
    { ...patched(1, [], { initial: true }) },
    { type: 'device:connected', device: phone, at },
    { type: 'device:applied', device: phone, revision: 1, ms: 300, at },
  );

  assert.deepEqual(kinds(state), ['note']);
  assert.equal(describeItem(state.feed[0], { cwd }).title, 'iPhone 18 Pro connected');
  assert.equal(state.devices[0]?.status, 'applied');
});

test('a device that disconnects leaves the device list', () => {
  const state = run(
    { type: 'device:connected', device: phone, at },
    { type: 'device:disconnected', device: phone, at },
  );

  assert.deepEqual(state.devices, []);

  assert.equal(
    describeItem(present(state.feed.at(1), 'note'), { cwd }).title,
    'iPhone 18 Pro disconnected',
  );
});

test('an unchanged rebuild is noted, and sends nothing', () => {
  const state = run({ type: 'unchanged', ms: 21, files: [entry], at });

  assert.deepEqual(describeItem(state.feed[0], { cwd }), {
    time: '02:05:14',
    icon: '·',
    tone: 'muted',
    title: 'unchanged',
    meta: 'demo/component-app.tsx · same output, no patch sent',
    detail: [],
  });
});

test('the placement report lists each file’s UI-thread code and every fallback with its reason', () => {
  const state = run({
    type: 'placement',
    files: [
      {
        file: 'demo/gestures.tsx',
        entries: [
          { site: 'Box translateX', line: 62, column: 22 },
          { site: 'tap onEnd', line: 90, column: 24 },
        ],
      },
      {
        file: 'demo/lab.tsx',
        entries: [
          { site: 'Box opacity', line: 12, column: 9 },
          { site: 'Box width', line: 14, column: 16, reason: 'constructs Thing' },
        ],
      },
    ],
    at,
  });
  const view = describeItem(present(state.feed[0], 'placement'), { cwd });

  assert.equal(view.title, 'Placement');
  assert.equal(view.tone, 'warning', 'a fallback is worth a look');
  assert.equal(view.meta, '3 on the UI thread · 1 on the JS thread');

  assert.deepEqual(
    view.detail.map((line) => line.text),
    [
      'demo/gestures.tsx  ui: Box translateX, tap onEnd',
      'demo/lab.tsx  ui: Box opacity',
      'demo/lab.tsx:14:16  Box width runs on the JS thread: it constructs Thing',
    ],
  );

  const placed = describeItem(
    present(
      run({
        type: 'placement',
        files: [
          { file: 'demo/gestures.tsx', entries: [{ site: 'Box rotate', line: 3, column: 1 }] },
        ],
      }).feed[0],
      'placement',
    ),
    { cwd },
  );

  assert.equal(placed.tone, 'success');
  assert.equal(placed.meta, '1 on the UI thread');
});
