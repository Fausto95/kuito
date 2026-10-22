import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { compileSource } from '../src/dev/transform.ts';
import { EVENT_RECORDS, SYSTEM_EVENT_RECORDS } from '../src/runtime/protocol.generated.ts';
import { installUIKernel, type UIHost } from './support/ui-host.ts';
/** The views these tests name, by the numbers the JS thread's kernel gives them. */

const views = { card: 1, header: 2, feed: 3, field: 4, button: 5, a: 6, b: 7 };

/** Compiles `source` and loads its UI bundle; returns the ids by kind and name. */
function load(host: UIHost, source: string, filename = 'app.tsx') {
  const compiled = compileSource(source, filename);

  host.load(compiled.ui);

  const id = (kind: string, name?: string) => {
    const found = compiled.functions.find(
      (fn) => fn.kind === kind && (name === undefined || fn.name === name),
    );

    if (!found) throw new Error(`No ${kind} ${name ?? ''} was compiled`);

    return found.id;
  };

  return id;
}

const propsOf = (host: UIHost, view: number, prop: string) =>
  host.props.filter(([id, name]) => id === view && name === prop).map(([, , value]) => value);

test('a prop bound to a motion value follows every write', () => {
  const host = installUIKernel();

  host.send(
    { op: 'motion', id: 'm1', value: 0 },
    { op: 'bind', view: views.card, prop: 'opacity', source: { $m: 'm1' } },
  );

  host.send({ op: 'motion', id: 'm1', value: 0.5 });

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [0, 0.5]);
  assert.deepEqual(host.mirror.get('m1'), { value: 0.5, js: 0 });
});

test('numbers are mirrored as numbers; other values whole, as plain data', () => {
  const host = installUIKernel();

  host.send(
    { op: 'motion', id: 'offset', value: 0.5 },
    { op: 'motion', id: 'tint', value: '#000' },
  );

  assert.deepEqual(host.mirror.get('offset'), { value: 0.5, js: 0 });
  assert.deepEqual(host.mirror.get('tint'), { value: '#000', js: 0 });
  assert.deepEqual(host.wholeMirrors, ['tint']);
});

test('a compiled prop expression re-runs only when a motion value it read changes', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Card() {
      const flag = motion(true), near = motion(0), far = motion(0);
      return <Box opacity={flag.value ? near.value / 100 : far.value / 100} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'flag', value: true },
    { op: 'motion', id: 'near', value: 50 },
    { op: 'motion', id: 'far', value: 0 },
    {
      op: 'bind',
      view: views.card,
      prop: 'opacity',
      source: { $t: id('expression'), c: [{ $m: 'flag' }, { $m: 'near' }, { $m: 'far' }] },
    },
  );

  host.send({ op: 'motion', id: 'far', value: 80 });

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [0.5], 'far was not read');

  host.send({ op: 'motion', id: 'flag', value: false });
  host.send({ op: 'motion', id: 'near', value: 10 });

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [0.5, 0.8], 'near is no longer read');
});

test('several writes in one message update a prop once', () => {
  const host = installUIKernel();

  host.send(
    { op: 'motion', id: 'm1', value: 0 },
    { op: 'bind', view: views.card, prop: 'translateY', source: { $m: 'm1' } },
  );

  host.send({ op: 'motion', id: 'm1', value: 1 }, { op: 'motion', id: 'm1', value: 2 });

  assert.deepEqual(propsOf(host, views.card, 'translateY'), [0, 2]);
});

test('a UI-thread event handler updates bound props before the event returns', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Feed() {
      const offset = motion(0);
      return <Scroll onScroll={(event) => {
        offset.value = event.contentOffset.y;
        track('scroll', event.contentOffset.y);
      }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'offset', value: 0 },
    { op: 'bind', view: views.header, prop: 'translateY', source: { $m: 'offset' } },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('handler'), c: [{ $m: 'offset' }, { $j: 7 }] },
    },
  );

  assert.equal(
    host.ui.event(views.feed, 'scroll', JSON.stringify({ contentOffset: { y: 40 } })),
    true,
  );

  assert.deepEqual(propsOf(host, views.header, 'translateY'), [0, 40]);
  assert.deepEqual(host.sent, [{ f: 7, args: ['scroll', 40] }]);

  assert.equal(
    host.ui.event(views.feed, 'press', '{}'),
    false,
    'no UI handler: the JS thread handles it',
  );
});

test('a typed event runs its UI-thread handler from the record; without one it goes on unread', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Feed() {
      const offset = motion(0);
      return <Scroll onScroll={(event) => { offset.value = event.y; }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'offset', value: 0 },
    { op: 'bind', view: views.header, prop: 'translateY', source: { $m: 'offset' } },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('handler'), c: [{ $m: 'offset' }] },
    },
  );

  const parses = host.ui.work.jsonParses;

  host.ui.eventNumbers.set([0, 40, 400, 2000, 400, 800]);

  assert.equal(host.ui.eventRecord(views.feed, 'scroll', EVENT_RECORDS.scroll.Scroll), true);
  assert.deepEqual(propsOf(host, views.header, 'translateY'), [0, 40]);

  // A layout this kernel has no table entry for would throw if it were read.
  assert.equal(host.ui.eventRecord(views.button, 'press', 999), false, 'no handler: unread');
  assert.equal(host.ui.work.jsonParses, parses, 'no JSON on either path');
});

test('a press the JS thread routes here reaches its handler without JSON', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Card() {
      const lift = motion(0);
      return <Pressable label="Card" onPress={(event) => { lift.value = event.pageY; }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'lift', value: 0 },
    { op: 'bind', view: views.card, prop: 'translateY', source: { $m: 'lift' } },
    { op: 'handler', key: `${views.card}.press`, fn: { $t: id('handler'), c: [{ $m: 'lift' }] } },
  );

  const parses = host.ui.work.jsonParses;

  host.send({
    op: 'dispatch',
    view: views.card,
    event: 'press',
    payload: { locationX: 1, locationY: 2, pageX: 3, pageY: 4 },
  });

  assert.deepEqual(propsOf(host, views.card, 'translateY'), [0, 4]);
  assert.equal(host.ui.work.jsonParses, parses, 'neither the message nor the event');
});

test('the UI kernel parses JSON only for a module view’s event a handler here takes', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Feed() {
      const offset = motion(0);
      return <Scroll onScroll={(event) => {
        offset.value = event.y;
        track(event.y);
      }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'offset', value: 0 },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('handler'), c: [{ $m: 'offset' }, { $j: 7 }] },
    },
  );

  assert.deepEqual({ ...host.ui.work }, { jsonParses: 0 }, 'operations arrive as plain data');

  host.ui.event(views.feed, 'scroll', JSON.stringify({ y: 40 }));
  host.ui.event(views.feed, 'press', JSON.stringify({ x: 1 }));

  assert.deepEqual(
    { ...host.ui.work },
    { jsonParses: 1 },
    'an event no handler takes goes on unparsed',
  );

  assert.deepEqual(host.sent, [{ f: 7, args: [40] }], 'the call to the JS thread is plain data');
});

test('a handler receives the field React Native passes, when the event prop names one', () => {
  const host = installUIKernel();
  const id = load(host, `export function echo(text) { latest.value = text; }`, 'echo.ts');

  host.send(
    { op: 'motion', id: 'latest', value: '' },
    {
      op: 'handler',
      key: `${views.field}.change`,
      field: 'text',
      fn: { $t: id('function'), c: [{ $m: 'latest' }] },
    },
  );

  host.ui.event(views.field, 'change', JSON.stringify({ text: 'hi' }));

  assert.deepEqual(host.mirror.get('latest'), { value: 'hi', js: 0 });
});

test('a captured signal reads its snapshot and writes go to the JS thread', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function toggle() { label.value = label.value + '!'; }`,
    'toggle.ts',
  );

  host.send({
    op: 'handler',
    key: `${views.button}.press`,
    fn: { $t: id('function'), c: [{ $s: 3, v: 'hi' }] },
  });

  host.ui.event(views.button, 'press', '{}');

  assert.deepEqual(host.sent, [{ s: 3, value: 'hi!' }]);
});

test('values cross with their tags: escaped keys, undefined and non-finite numbers', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function describe() {
      const style = box.value;
      return style.$color === undefined ? String(style.width) : 'colored';
    }`,
    'describe.ts',
  );

  host.send(
    { op: 'motion', id: 'box', value: { $o: { $color: { $u: 1 }, width: { $n: 'Infinity' } } } },
    {
      op: 'bind',
      view: views.card,
      prop: 'label',
      source: { $t: id('function'), c: [{ $m: 'box' }] },
    },
  );

  assert.deepEqual(propsOf(host, views.card, 'label'), ['Infinity']);
});

test('a failing expression is reported and unbound; other bindings keep working', () => {
  const host = installUIKernel();
  const id = load(host, `export function broken() { return missing.value.length; }`, 'broken.ts');

  host.send(
    { op: 'motion', id: 'm1', value: 1 },
    { op: 'motion', id: 'missing', value: null },
    { op: 'bind', view: views.card, prop: 'opacity', source: { $m: 'm1' } },
    {
      op: 'bind',
      view: views.card,
      prop: 'width',
      source: { $t: id('function'), c: [{ $m: 'missing' }] },
    },
  );

  assert.equal(host.logs.length, 1);
  assert.match(host.logs[0][1], new RegExp(views.card + '\\.width'));

  host.send({ op: 'motion', id: 'm1', value: 0.3 }, { op: 'motion', id: 'missing', value: 'x' });

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [1, 0.3]);
  assert.deepEqual(propsOf(host, views.card, 'width'), []);
});

test('unbind, unhandle, free and reset release what the JS thread registered', () => {
  const host = installUIKernel();
  const id = load(host, `export function noop() {}`, 'noop.ts');

  host.send(
    { op: 'motion', id: 'm1', value: 0 },
    { op: 'bind', view: views.card, prop: 'opacity', source: { $m: 'm1' } },
  );

  host.send(
    { op: 'unbind', view: views.card, prop: 'opacity' },
    { op: 'motion', id: 'm1', value: 1 },
  );

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [0]);

  host.send({ op: 'free', id: 'm1' });

  assert.throws(
    () => host.send({ op: 'bind', view: views.card, prop: 'opacity', source: { $m: 'm1' } }),
    /Unknown motion value m1/,
  );

  host.send(
    { op: 'handler', key: `${views.a}.scroll`, fn: { $t: id('function'), c: [] } },
    { op: 'handler', key: `${views.b}.scroll`, fn: { $t: id('function'), c: [] } },
    { op: 'unhandle', key: `${views.a}.scroll` },
  );

  assert.equal(host.ui.event(views.a, 'scroll', '{}'), false);
  assert.equal(host.ui.event(views.b, 'scroll', '{}'), true);

  host.send({ op: 'reset' });
  assert.equal(host.ui.event(views.b, 'scroll', '{}'), false);
});

test('a new revision keeps the UI functions it still defines and prunes the rest', () => {
  const host = installUIKernel();
  const before = load(
    host,
    'export function fade() { a.value = 1; }\nexport function slide() { a.value = 2; }',
    'anim.ts',
  );

  // Each bundle the kernel sends is followed by a sweep.
  host.send({ op: 'sweep' });

  // The edit changes slide and moves fade below it.
  const after = load(
    host,
    'export function slide() { a.value = 3; }\n\nexport function fade() { a.value = 1; }',
    'anim.ts',
  );

  host.send({ op: 'motion', id: 'a', value: 0 }, { op: 'sweep' });

  assert.equal(after('function', 'fade'), before('function', 'fade'), 'fade is unchanged');
  assert.equal(host.ui.stats().functions, 2, "the old slide is pruned; fade isn't duplicated");

  host.send({
    op: 'handler',
    key: `${views.card}.press`,
    fn: { $t: before('function', 'fade'), c: [{ $m: 'a' }] },
  });

  assert.equal(
    host.ui.event(views.card, 'press', '{}'),
    true,
    'a binding to fade outlives the revision',
  );

  assert.throws(
    () =>
      host.send({
        op: 'handler',
        key: `${views.card}.swipe`,
        fn: { $t: before('function', 'slide'), c: [{ $m: 'a' }] },
      }),
    /Unknown UI-thread function/,
  );
});

test('a watched motion value tells the JS thread when UI-thread code moves it', () => {
  const host = installUIKernel();

  const id = load(host, `export function move() { a.value = 4; b.value = 4; }`, 'move.ts');

  host.send(
    { op: 'motion', id: 'a', value: 0 },
    { op: 'motion', id: 'b', value: 0 },
    { op: 'watch', id: 'a' },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('function'), c: [{ $m: 'a' }, { $m: 'b' }] },
    },
  );

  host.send({ op: 'motion', id: 'a', value: 1 });

  assert.deepEqual(host.sent, [], 'the JS thread already knows its own writes');

  const frames = host.requested.frames;

  host.ui.event(views.feed, 'scroll', '{}');

  assert.deepEqual(host.sent, [], 'it waits for the frame');
  assert.equal(host.requested.frames, frames + 1);

  host.ui.frame(16);

  assert.deepEqual(host.sent, [{ w: [['a', 4]] }]);
});

test('watched values a frame moves reach the JS thread as one message, latest values', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function move(event) { a.value = event.a; b.value = event.b; }`,
    'move.ts',
  );

  host.send(
    { op: 'motion', id: 'a', value: 0 },
    { op: 'motion', id: 'b', value: 0 },
    { op: 'watch', id: 'a' },
    { op: 'watch', id: 'b' },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('function'), c: [{ $m: 'a' }, { $m: 'b' }] },
    },
  );

  host.ui.event(views.feed, 'scroll', JSON.stringify({ a: 1, b: 2 }));
  host.ui.event(views.feed, 'scroll', JSON.stringify({ a: 3, b: 4 }));
  host.ui.frame(16);
  host.ui.frame(32);

  assert.deepEqual(host.sent, [
    {
      w: [
        ['a', 3],
        ['b', 4],
      ],
    },
  ]);
});

test("a view's gesture events run its callbacks on the UI thread, before the event returns", () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function follow(event) { x.value = x.value + event.changeX; }`,
    'follow.ts',
  );

  host.send(
    { op: 'motion', id: 'x', value: 0 },
    { op: 'bind', view: views.card, prop: 'translateX', source: { $m: 'x' } },
    {
      op: 'handler',
      key: `${views.card}.gesture`,
      gestures: [
        {
          tag: 3,
          type: 'pan',
          kind: 'pan',
          gesture: 1,
          callbacks: { onChange: { $t: id('function'), c: [{ $m: 'x' }] }, onEnd: { $j: 9 } },
        },
      ],
    },
  );

  const gesture = (payload: object) =>
    host.ui.event(
      views.card,
      'gesture',
      JSON.stringify({ handlerTag: 3, numberOfPointers: 1, pointerType: 0, ...payload }),
    );

  assert.equal(gesture({ state: 4, oldState: 2 }), true);
  gesture({ state: 4, translationX: 12 });
  gesture({ state: 4, translationX: 30 });

  assert.deepEqual(propsOf(host, views.card, 'translateX'), [0, 12, 30]);

  gesture({ state: 5, oldState: 4, velocityX: 500 });

  assert.deepEqual(host.sent, [
    {
      f: 9,
      args: [
        {
          handlerTag: 3,
          numberOfPointers: 1,
          pointerType: 0,
          state: 5,
          oldState: 4,
          velocityX: 500,
          type: 'gesture',
        },
        true,
      ],
    },
  ]);
});

/** A pan on the card that motion value `x` follows; returns a sender for its events. */
function followedPan(host: UIHost, releasing?: object) {
  host.send(
    { op: 'motion', id: 'x', value: 0 },
    { op: 'bind', view: views.card, prop: 'translateX', source: { $m: 'x' } },
    { op: 'follow', id: 'x', gesture: 7, field: 'x', home: 0 },
    {
      op: 'handler',
      key: `${views.card}.gesture`,
      gestures: [
        {
          tag: 3,
          type: 'pan',
          kind: 'pan',
          gesture: 7,
          callbacks: {},
          ...(releasing && { releasing }),
        },
      ],
    },
  );

  return (payload: object) =>
    host.ui.event(
      views.card,
      'gesture',
      JSON.stringify({ handlerTag: 3, numberOfPointers: 1, pointerType: 0, ...payload }),
    );
}

test('a motion value follows a gesture with no code at all, and sends nothing back', () => {
  const host = installUIKernel();
  const gesture = followedPan(host);

  gesture({ state: 4, oldState: 2 });
  gesture({ state: 4, translationX: 12 });
  gesture({ state: 4, translationX: 30 });
  gesture({ state: 5, oldState: 4 });
  gesture({ state: 4, oldState: 2 });
  gesture({ state: 4, translationX: -10 });

  assert.deepEqual(propsOf(host, views.card, 'translateX'), [0, 12, 30, 20]);
  assert.deepEqual(host.sent, []);
});

test('a release springs home with the finger’s velocity', () => {
  const host = installUIKernel();
  const gesture = followedPan(host, {
    __kuitoAnimation: {
      type: 'spring',
      damping: 20,
      stiffness: 200,
      mass: 1,
      velocity: 0,
      overshootClamping: false,
      energyThreshold: 6e-9,
      delay: 0,
    },
  });

  gesture({ state: 4, oldState: 2 });
  gesture({ state: 4, translationX: 100 });
  gesture({ state: 5, oldState: 4, velocityX: 2000 });

  for (let now = 0; now <= 50; now += 1000 / 60) host.ui.frame(now);

  const moved = propsOf(host, views.card, 'translateX').map(Number);

  assert.ok(
    Math.max(...moved) > 100,
    'it carries on past where it was let go: ' + moved.join(', '),
  );

  for (let now = 50; now <= 3000; now += 1000 / 60) host.ui.frame(now);

  assert.equal(host.mirror.get('x') && (host.mirror.get('x') as { value: number }).value, 0);
  assert.deepEqual(host.sent, []);
});

test('derived motion computes on the UI thread: interpolate, clamp, map', () => {
  const host = installUIKernel();
  const id = load(host, `export const half = (v) => v / 2;`, 'half.ts');

  host.send(
    { op: 'motion', id: 'x', value: 0 },
    {
      op: 'bind',
      view: views.card,
      prop: 'opacity',
      source: {
        $d: {
          from: { $m: 'x' },
          op: 'interpolate',
          input: [0, 100],
          output: [1, 0],
          extrapolate: 'clamp',
        },
      },
    },
    {
      op: 'bind',
      view: views.card,
      prop: 'backgroundColor',
      source: {
        $d: {
          from: { $m: 'x' },
          op: 'interpolate',
          input: [0, 100],
          output: ['#000000', '#ffffff'],
          extrapolate: 'clamp',
        },
      },
    },
    {
      op: 'bind',
      view: views.card,
      prop: 'translateX',
      source: {
        $d: {
          from: { $d: { from: { $m: 'x' }, op: 'clamp', min: 0, max: 60 } },
          op: 'map',
          fn: { $t: id('function', 'half'), c: [] },
        },
      },
    },
  );

  host.send({ op: 'motion', id: 'x', value: 50 });
  host.send({ op: 'motion', id: 'x', value: 200 });

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [1, 0.5, 0]);
  assert.deepEqual(propsOf(host, views.card, 'backgroundColor'), ['#000000', '#808080', '#ffffff']);
  assert.deepEqual(propsOf(host, views.card, 'translateX'), [0, 25, 30]);
});

test('a motion value follows another source until told to stop', () => {
  const host = installUIKernel();

  host.send(
    { op: 'motion', id: 'x', value: 0 },
    { op: 'motion', id: 'y', value: 0 },
    {
      op: 'follow',
      id: 'y',
      source: { $d: { from: { $m: 'x' }, op: 'clamp', min: 0, max: 10 } },
    },
  );

  host.send({ op: 'motion', id: 'x', value: 4 });
  host.send({ op: 'motion', id: 'x', value: 40 });

  assert.deepEqual(host.mirror.get('y'), { value: 10, js: 0 });

  host.send({ op: 'follow', id: 'y', source: null }, { op: 'motion', id: 'x', value: 2 });

  assert.deepEqual(host.mirror.get('y'), { value: 10, js: 0 });
});

test('UI-thread code has a console, which writes to the host log', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function report(value) { console.log('moved', value, { x: 1 }); console.warn('slow'); }`,
    'report.ts',
  );

  host.send({ op: 'handler', key: `${views.card}.press`, fn: { $t: id('function'), c: [] } });
  host.ui.event(views.card, 'press', '{}');

  assert.deepEqual(host.logs, [
    ['log', "moved { type: 'press' } { x: 1 }"],
    ['warn', 'slow'],
  ]);
});

test('with an inspector attached, UI-thread console methods are its own', () => {
  const inspected: Array<[string, unknown[]]> = [];
  const host = installUIKernel({
    __kuitoHostConsole(level: string, method: (...values: unknown[]) => void) {
      return (...values: unknown[]) => {
        inspected.push([level, values]);
        method(...values);
      };
    },
  });
  const id = load(
    host,
    `export function report(value) { console.log('moved', value); }`,
    'report.ts',
  );

  host.send({ op: 'handler', key: `${views.card}.press`, fn: { $t: id('function'), c: [] } });
  host.ui.event(views.card, 'press', '{}');

  const [[level, values] = ['', []]] = inspected;

  assert.equal(inspected.length, 1);
  assert.equal(level, 'log');
  assert.equal((values[1] as { type?: string }).type, 'press');
  assert.deepEqual(host.logs, [['log', "moved { type: 'press' }"]]);
});

test('a press the JS thread routes here runs its handler as a native one would', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Card() {
      const on = motion(false);
      return <Pressable label="Card" onPress={(event) => { on.value = event.x > 2; }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'on', value: false },
    { op: 'bind', view: views.card, prop: 'opacity', source: { $m: 'on' } },
    { op: 'handler', key: `${views.card}.press`, fn: { $t: id('handler'), c: [{ $m: 'on' }] } },
    { op: 'dispatch', view: views.card, event: 'press', payload: { x: 4 } },
  );

  assert.deepEqual(propsOf(host, views.card, 'opacity'), [true]);
});

test('a label joins its parts: text, functions and motion values', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function Count() { const taps = motion(0); return <Text>{taps.value}</Text>; }`,
  );

  host.send(
    { op: 'motion', id: 'taps', value: 1 },
    {
      op: 'bind',
      view: views.card,
      prop: 'text',
      source: [{ $t: id('expression'), c: [{ $m: 'taps' }] }, ' taps of ', { $m: 'taps' }],
    },
    { op: 'motion', id: 'taps', value: 2 },
  );

  assert.deepEqual(propsOf(host, views.card, 'text'), ['2 taps of 2']);
});

test('the platform writes a module motion value straight into the UI thread', () => {
  const host = installUIKernel();

  host.send(
    { op: 'linked', id: 'l7', value: null },
    { op: 'bind', view: views.card, prop: 'translateX', source: { $m: 'l7' } },
  );

  host.ui.platform(7, 40);

  assert.deepEqual(propsOf(host, views.card, 'translateX'), [null, 40]);
  assert.deepEqual(host.sent, [], 'the platform tells the JS thread itself');

  host.send({ op: 'linked', id: 'l7', value: null });
  assert.deepEqual(propsOf(host, views.card, 'translateX'), [null, 40], 'linking again keeps it');
});

test("a view's motion source moves its motion values from the record, keeping the event here", () => {
  const host = installUIKernel();

  host.send(
    { op: 'linked', id: 'm1', value: 0 },
    { op: 'linked', id: 'm2', value: 0 },
    { op: 'linked', id: 'm3', value: 0 },
    { op: 'bind', view: views.header, prop: 'translateY', source: { $m: 'm1' } },
    { op: 'bind', view: views.header, prop: 'scale', source: { $m: 'm3' } },
    {
      op: 'handler',
      key: `${views.feed}.motion`,
      motion: { offset: 'm1', velocity: 'm2', overscroll: 'm3' },
    },
    { op: 'watch', id: 'm2' },
  );

  const parses = host.ui.work.jsonParses;

  host.ui.eventNumbers.set([120, 900, -5]);

  assert.equal(
    host.ui.eventRecord(views.feed, 'motion', EVENT_RECORDS.motion.Scroll),
    true,
    'the JS thread never hears of it',
  );

  assert.deepEqual(propsOf(host, views.header, 'translateY'), [0, 120]);
  assert.deepEqual(propsOf(host, views.header, 'scale'), [0, -5]);
  assert.deepEqual(host.mirror.get('m2'), { value: 900, js: 0 }, 'mirrored as a number');
  assert.equal(host.ui.work.jsonParses, parses);

  host.ui.frame(16);

  assert.deepEqual(host.sent, [{ w: [['m2', 900]] }], 'a watched one reaches the JS thread');
});

test("the keyboard's moves write keyboard.height here, every frame, and stop here", () => {
  const host = installUIKernel();

  host.send(
    { op: 'linked', id: 'm4', value: 0 },
    { op: 'bind', view: views.card, prop: 'translateY', source: { $m: 'm4' } },
    { op: 'handler', key: '0.keyboard.move', motion: { height: 'm4' } },
  );

  host.ui.eventNumbers.set([140]);

  assert.equal(
    host.ui.eventRecord(0, 'keyboard.move', SYSTEM_EVENT_RECORDS['keyboard.move']),
    true,
    'the JS thread never hears of it',
  );

  assert.deepEqual(propsOf(host, views.card, 'translateY'), [0, 140]);
});

test("the keyboard's events move keyboard.frame here and still reach the JS thread", () => {
  const host = installUIKernel();
  const frame = { screenX: 0, screenY: 500, width: 400, height: 300 };

  host.send(
    { op: 'keyboard', id: 'keyboard', value: null },
    { op: 'bind', view: views.card, prop: 'translateY', source: { $m: 'keyboard' } },
  );

  assert.equal(
    host.ui.event(0, 'keyboard.didshow', JSON.stringify({ ...frame, duration: 250 })),
    false,
    'the JS thread hears it too',
  );

  // Plain data, as C++ takes it: an object prop is never JSON on this side either.
  const shown = () => propsOf(host, views.card, 'translateY').map((value) => value && { ...value });

  assert.deepEqual(shown(), [null, frame]);

  host.ui.event(0, 'keyboard.didhide', JSON.stringify({ ...frame, duration: 250 }));
  assert.deepEqual(shown(), [null, frame, null]);
});

test('a function that names an outer one being made calls it once it is made', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function even(n) { return n === 0 ? true : odd(n - 1); }
    export function odd(n) { return n === 0 ? false : even(n - 1); }
    export function Card() {
      const on = motion(0);
      return <Pressable label="Card" onPress={() => { on.value = even(3) ? 1 : 2; }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'on', value: 0 },
    { op: 'bind', view: views.card, prop: 'opacity', source: { $m: 'on' } },
    {
      op: 'handler',
      key: `${views.card}.press`,
      fn: {
        $t: id('handler'),
        c: [
          { $m: 'on' },
          {
            $t: id('function', 'even'),
            c: [{ $t: id('function', 'odd'), c: [{ $r: id('function', 'even') }] }],
          },
        ],
      },
    },
  );

  assert.equal(host.ui.event(views.card, 'press', '{}'), true);
  assert.deepEqual(propsOf(host, views.card, 'opacity'), [0, 2]);
});

/**
 * A UI kernel whose clock moves only when its code calls `spend(ms)`, a
 * main-thread module function (`$l`) that takes that long.
 */
function installTimedUIKernel(globals: (clock: { now: number }) => object = () => ({})) {
  const clock = { now: 0 };
  const host = installUIKernel({
    __kuitoUINow: () => clock.now,
    __kuitoUIHostCall(_id: number, ms: number) {
      clock.now += ms;
    },
    ...globals(clock),
  });

  return { host, clock };
}

const spend = { $l: 1 };

test('a frame over its UI-thread budget is reported once, naming the code and its place', () => {
  const { host, clock } = installTimedUIKernel();
  const id = load(
    host,
    `export function Card() {
      const cost = motion(1);
      return <Box width={(spend(cost.value), cost.value)} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'cost', value: 1 },
    {
      op: 'bind',
      view: views.card,
      prop: 'width',
      source: { $t: id('expression'), c: [spend, { $m: 'cost' }] },
    },
  );

  assert.deepEqual(host.logs, [], 'one millisecond is within the budget');

  clock.now += 100;
  host.send({ op: 'motion', id: 'cost', value: 6 });

  assert.equal(host.logs.length, 1);

  const [[level, message] = ['', '']] = host.logs;

  assert.equal(level, 'warn');
  assert.match(message, /6(\.0)? ms/);
  assert.match(message, /budget/);
  assert.match(message, /app\.tsx:3:\d+/, 'where the binding is');

  clock.now += 100;
  host.send({ op: 'motion', id: 'cost', value: 7 });

  assert.equal(host.logs.length, 1, 'the same code is reported once');
});

test("a frame's UI-thread time adds up across the events it handles", () => {
  const { host, clock } = installTimedUIKernel();
  const id = load(
    host,
    `export function Feed() {
      const offset = motion(0);
      return <Scroll onScroll={(event) => { offset.value = event.cost; spend(event.cost); }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'offset', value: 0 },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('handler'), c: [{ $m: 'offset' }, spend] },
    },
  );

  host.ui.event(views.feed, 'scroll', JSON.stringify({ cost: 3 }));
  clock.now += 100;
  host.ui.event(views.feed, 'scroll', JSON.stringify({ cost: 3 }));

  assert.deepEqual(host.logs, [], 'three milliseconds a frame is within the budget');

  host.ui.event(views.feed, 'scroll', JSON.stringify({ cost: 3 }));

  assert.equal(host.logs.length, 1, 'two events in one frame are over it');
  assert.match(host.logs[0][1], /app\.tsx:3:\d+/, 'where the handler is');
});

test("a derived value's function is app code: timed, and named by its place", () => {
  const { host, clock } = installTimedUIKernel();
  const id = load(host, `export const slow = (v) => (spend(v), v);`, 'slow.ts');

  host.send(
    { op: 'motion', id: 'cost', value: 1 },
    {
      op: 'bind',
      view: views.card,
      prop: 'width',
      source: {
        $d: { from: { $m: 'cost' }, op: 'map', fn: { $t: id('function', 'slow'), c: [spend] } },
      },
    },
  );

  assert.deepEqual(host.logs, [], 'one millisecond is within the budget');

  clock.now += 100;
  host.send({ op: 'motion', id: 'cost', value: 6 });

  assert.equal(host.logs.length, 1);
  assert.match(host.logs[0]?.[1] ?? '', /map at slow\.ts:1:\d+/);
});

test('app code that calls app code counts once', () => {
  const { host, clock } = installTimedUIKernel();
  const id = load(
    host,
    `export function Card() {
      const cost = motion(1);
      const wide = cost.map((v) => (spend(v), v));
      return <Box width={wide.value + 0} />;
    }`,
  );
  const wide = {
    $d: { from: { $m: 'cost' }, op: 'map', fn: { $t: id('callback', 'map'), c: [spend] } },
  };

  host.send(
    { op: 'motion', id: 'cost', value: 1 },
    { op: 'bind', view: views.card, prop: 'width', source: { $t: id('expression'), c: [wide] } },
  );

  clock.now += 100;
  host.send({ op: 'motion', id: 'cost', value: 3 });

  assert.deepEqual(host.logs, [], 'three milliseconds, not six, is within the budget');
});

test("the kernel's own work, like a mount's, is not the app code's budget", () => {
  const { host } = installTimedUIKernel((clock) => ({
    // Writing a native prop is the kernel's work, however long it takes.
    __kuitoUISetProp() {
      clock.now += 10;
    },
  }));
  const id = load(
    host,
    `export function Card() {
      const cost = motion(1);
      return <Box width={(spend(cost.value), cost.value)} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'cost', value: 1 },
    {
      op: 'bind',
      view: views.card,
      prop: 'width',
      source: { $t: id('expression'), c: [spend, { $m: 'cost' }] },
    },
  );

  assert.deepEqual(host.logs, [], 'one millisecond of app code is within the budget');
});

test("a report's stack is the slow code's place, for the LogBox's code frame", () => {
  const stacks: string[] = [];
  const { host } = installTimedUIKernel(() => ({
    __kuitoUILog(_level: string, _message: string, stack: string) {
      stacks.push(stack);
    },
  }));
  const id = load(
    host,
    `export function Feed() {
      const offset = motion(0);
      return <Scroll onScroll={(event) => { offset.value = event.cost; spend(event.cost); }} />;
    }`,
  );

  host.send(
    { op: 'motion', id: 'offset', value: 0 },
    {
      op: 'handler',
      key: `${views.feed}.scroll`,
      fn: { $t: id('handler'), c: [{ $m: 'offset' }, spend] },
    },
  );

  host.ui.event(views.feed, 'scroll', JSON.stringify({ cost: 5 }));

  assert.equal(stacks.length, 1);

  assert.match(
    stacks[0] ?? '',
    new RegExp(`^ {4}at ${views.feed}\\.scroll \\(app\\.tsx:3:\\d+\\)$`),
  );
});

test('a chain of motion values following each other settles in one flush', () => {
  const host = installUIKernel();
  const chain = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];

  host.send(
    ...chain.map((id) => ({ op: 'motion', id, value: 0 })),
    ...chain.slice(1).map((id, index) => ({
      op: 'follow',
      id,
      source: { $d: { from: { $m: chain[index] }, op: 'clamp', min: 0, max: 100 } },
    })),
    { op: 'bind', view: views.card, prop: 'width', source: { $m: 'm7' } },
  );

  host.send({ op: 'motion', id: 'm0', value: 5 });

  assert.deepEqual(propsOf(host, views.card, 'width'), [0, 5]);
  assert.deepEqual(host.logs, []);
});

test('motion values that keep moving each other are reported and stop following', () => {
  const host = installUIKernel();
  const id = load(host, `export const next = (v) => v + 1;`, 'next.ts');
  const plusOne = (from: string) => ({
    $d: { from: { $m: from }, op: 'map', fn: { $t: id('function', 'next'), c: [] } },
  });

  host.send(
    { op: 'motion', id: 'x', value: 0 },
    { op: 'motion', id: 'y', value: 0 },
    { op: 'bind', view: views.card, prop: 'width', source: { $m: 'x' } },
    { op: 'follow', id: 'x', source: plusOne('y') },
    { op: 'follow', id: 'y', source: plusOne('x') },
  );

  assert.equal(host.logs.length, 1);

  const [[level, message] = ['', '']] = host.logs;

  assert.equal(level, 'error');
  assert.match(message, /keep moving each other/);
  assert.match(message, /motion value x/);
  assert.match(message, /motion value y/);

  const width = propsOf(host, views.card, 'width').length;

  host.send({ op: 'motion', id: 'y', value: 50 });

  assert.equal(propsOf(host, views.card, 'width').length, width, 'x follows y no more');
  assert.equal(host.logs.length, 1);
});

test('code over budget is reported once wherever it runs, and again after a Live Patch', () => {
  const { host, clock } = installTimedUIKernel();
  const source = `export function Row() {
      const offset = motion(0);
      return <Scroll onScroll={(event) => { offset.value = event.cost; spend(event.cost); }} />;
    }`;
  const id = load(host, source);
  const handle = (view: number) => ({
    op: 'handler',
    key: `${view}.scroll`,
    fn: { $t: id('handler'), c: [{ $m: 'offset' }, spend] },
  });

  host.send({ op: 'motion', id: 'offset', value: 0 }, handle(views.a), handle(views.b));

  host.ui.event(views.a, 'scroll', JSON.stringify({ cost: 5 }));
  clock.now += 100;
  host.ui.event(views.b, 'scroll', JSON.stringify({ cost: 5 }));

  assert.equal(host.logs.length, 1, 'one handler in two rows is one piece of code');

  load(host, source);
  host.send({ op: 'sweep' });
  clock.now += 100;
  host.ui.event(views.b, 'scroll', JSON.stringify({ cost: 5 }));

  assert.equal(host.logs.length, 2, 'a patch may have changed it');
});

test('a chain of followers longer than a flush allows is cut, and props stay bound', () => {
  const host = installUIKernel();
  const chain = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'];

  host.send(
    ...chain.map((id) => ({ op: 'motion', id, value: 0 })),
    ...chain.slice(1).map((id, index) => ({
      op: 'follow',
      id,
      source: { $d: { from: { $m: chain[index] }, op: 'clamp', min: 0, max: 100 } },
    })),
    { op: 'bind', view: views.card, prop: 'width', source: { $m: 'm9' } },
    { op: 'bind', view: views.header, prop: 'width', source: { $m: 'm8' } },
  );

  host.send({ op: 'motion', id: 'm0', value: 5 });

  assert.equal(host.logs.length, 1);
  assert.match(host.logs[0][1], /motion value m9/);
  assert.doesNotMatch(host.logs[0][1], /view/, 'no prop is stopped');
  assert.deepEqual(propsOf(host, views.header, 'width'), [0, 5]);

  host.send({ op: 'motion', id: 'm9', value: 9 });

  assert.deepEqual(propsOf(host, views.card, 'width'), [0, 9], 'the end of the chain still shows');
});

test("a field's format answers its edit before the event returns: the text, then the caret", () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function card(text) { return text.replace(/\\D/g, '').replace(/(\\d{4})(?=\\d)/g, '$1 '); }`,
    'card.ts',
  );

  host.send({
    op: 'handler',
    key: `${views.field}.format`,
    format: true,
    fn: { $t: id('function'), c: [] },
  });

  assert.equal(
    host.ui.event(views.field, 'format', JSON.stringify({ text: '42424', start: 5, end: 5 })),
    true,
  );

  // Copied out of the UI kernel's realm for a structural comparison.
  assert.deepEqual(
    JSON.parse(JSON.stringify(host.props.filter(([view]) => view === views.field))),
    [
      [views.field, 'text', '4242 4'],
      [views.field, 'selection', { start: 6, end: 6 }],
    ],
  );

  host.props.length = 0;
  host.ui.event(views.field, 'format', JSON.stringify({ text: '4242 4', start: 6, end: 6 }));

  assert.deepEqual(host.props, [], 'a text the format keeps is the field’s already');
});

test('a format that throws is reported, and the edit stays as typed', () => {
  const host = installUIKernel();
  const id = load(
    host,
    `export function broken(text) { return text.missing.length; }`,
    'broken.ts',
  );

  host.send({
    op: 'handler',
    key: `${views.field}.format`,
    format: true,
    fn: { $t: id('function'), c: [] },
  });

  assert.equal(
    host.ui.event(views.field, 'format', JSON.stringify({ text: 'a', start: 1, end: 1 })),
    true,
    'answered: the field reports its change as it is',
  );

  assert.deepEqual(host.props, []);
  assert.equal(host.logs.length, 1);
  assert.match(host.logs[0][1], new RegExp(views.field + '\\.format'));
});
