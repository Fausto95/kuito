import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { easing, decay, spring, timing } from '../src/runtime/animation-specs.ts';
import { sequence } from '../src/runtime/compose.ts';
import { clamp, interpolate } from '../src/runtime/derived.ts';
import { State, longPress, pan, race, tap } from '../src/runtime/gesture-specs.ts';
import { readFileSync } from 'node:fs';
import { UI_KERNEL_OUTPUT, uiKernelHash } from '../src/dev/kernel.ts';
import { installUIKernel } from './support/ui-host.ts';
import { make, type Motion } from './support/thread-kernel.ts';

/** A motion value as app code holds one: it can follow a source and derive others. */
type Followed = Motion & {
  follows(source: unknown): Followed;
  map(fn: (value: number) => number): unknown;
};

const followed = (motion: Motion): Followed => motion as Followed;

import { handleOf, nativeEvent } from './support/host-wire.ts';

test('the UI runtime starts only when an app first needs the UI thread', async () => {
  const kernel = make();

  kernel.threads.__kuito.loadUI('/* ui bundle */');
  kernel.render(() => kernel.host.__kuitoJSX('Box', { id: 'card', opacity: 1 }));
  await kernel.settle();

  assert.deepEqual(kernel.kernels, []);
  assert.deepEqual(kernel.scripts, []);
  assert.deepEqual(kernel.operations, []);

  let offset: Motion | undefined;

  kernel.host.__kuito.patch('app', (api) =>
    api.render(
      kernel.host.__kuitoJSX(() => {
        offset = kernel.threads.__kuito.useMotion(0);

        return kernel.host.__kuitoJSX('Box', { id: 'card', translateY: () => offset });
      }, {}),
    ),
  );

  await kernel.settle();

  // The host loads the UI kernel it ships; the kernel names the one it was built with.
  assert.deepEqual(kernel.kernels, [uiKernelHash(readFileSync(UI_KERNEL_OUTPUT, 'utf8'))]);
  assert.deepEqual(kernel.scripts, ['kuito://ui/1']);
  assert.ok(offset);
});

test('a UI bundle the compiler names keeps that name on the UI thread', async () => {
  const kernel = make();

  // DevTools finds the bundle's source by this name (docs/devtools.md).
  kernel.threads.__kuito.loadUI('/* ui bundle */', 'kuito://ui/0a1b2c3d4e5f');

  kernel.host.__kuito.patch('app', (api) =>
    api.render(
      kernel.host.__kuitoJSX(() => {
        const offset = kernel.threads.__kuito.useMotion(0);

        return kernel.host.__kuitoJSX('Box', { id: 'card', translateY: () => offset });
      }, {}),
    ),
  );

  await kernel.settle();

  assert.deepEqual(kernel.scripts, ['kuito://ui/0a1b2c3d4e5f']);
});

test('a release build names the UI bundle its shell ships instead of sending its source', async () => {
  const kernel = make();
  const hash = 'a'.repeat(40);

  kernel.threads.__kuito.loadShippedUI(hash, 'kuito://ui/0a1b2c3d4e5f');
  // A bundle loaded again is the same revision: nothing new crosses.
  kernel.threads.__kuito.loadShippedUI(hash, 'kuito://ui/0a1b2c3d4e5f');

  kernel.host.__kuito.patch('app', (api) =>
    api.render(
      kernel.host.__kuitoJSX(() => {
        const offset = kernel.threads.__kuito.useMotion(0);

        return kernel.host.__kuitoJSX('Box', { id: 'card', translateY: () => offset });
      }, {}),
    ),
  );

  await kernel.settle();

  assert.equal(kernel.kernels.length, 1, 'the UI kernel loads first');
  assert.deepEqual(kernel.bundles, [{ hash, url: 'kuito://ui/0a1b2c3d4e5f' }]);
  assert.deepEqual(kernel.scripts, []);
  assert.ok(kernel.operations.length > 0, 'its operations follow it');
});

test('a UI bundle that is not named by a SHA-1 is refused where it is loaded', () => {
  const kernel = make();

  assert.throws(() => kernel.threads.__kuito.loadShippedUI('app-ui.hbc', 'kuito://ui/1'), /hash/);
});

test('a prop that reads a motion value is bound on the UI thread', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(0);
    const opacity = __kuitoThread(
      () => 1 - Number(offset.value) / 200,
      'tf_opacity',
      () => [offset],
      [['offset', 'read']],
    );

    return kernel.host.__kuitoJSX('Box', { id: 'card', opacity, translateY: () => offset });
  });

  await kernel.settle();

  const [motion] = kernel.ops('motion');

  assert.deepEqual(motion, { op: 'motion', id: 'm1', value: 0, version: 0 });

  assert.deepEqual(kernel.ops('bind'), [
    {
      op: 'bind',
      view: handleOf(kernel.host.__kuito, 'card'),
      prop: 'opacity',
      source: { $t: 'tf_opacity', c: [{ $m: 'm1' }] },
    },
    {
      op: 'bind',
      view: handleOf(kernel.host.__kuito, 'card'),
      prop: 'translateY',
      source: { $m: 'm1' },
    },
  ]);

  assert.deepEqual(kernel.sent('card', 'opacity'), [], 'the JS thread never writes it');
});

test('JS-thread reads see their own writes until the UI thread has applied them', async () => {
  const kernel = make();
  let offset: Motion | undefined;

  kernel.render(() => {
    offset = kernel.threads.__kuito.useMotion(0);

    return kernel.host.__kuitoJSX('Box', { id: 'card' });
  });

  assert.ok(offset);

  offset.value = 5;
  assert.equal(offset.value, 5);
  await kernel.settle();

  assert.deepEqual(
    kernel.ops('motion').filter((operation) => operation.version === 1),
    [{ op: 'motion', id: 'm1', value: 5, version: 1 }],
  );

  kernel.mirror.set('m1', { value: 3, js: 0 });
  assert.equal(offset.value, 5, 'the mirror predates the write');

  kernel.mirror.set('m1', { value: 7, js: 1 });
  assert.equal(offset.value, 7, 'the UI thread moved it since');
});

test('a JS-thread read takes a number from the mirror alone, anything else whole', async () => {
  const kernel = make();
  let offset: Motion | undefined;

  kernel.render(() => {
    offset = kernel.threads.__kuito.useMotion(0);

    return kernel.host.__kuitoJSX('Box', { id: 'card' });
  });

  assert.ok(offset);
  offset.value = 5;
  await kernel.settle();
  kernel.reads.whole = 0;

  kernel.mirror.set('m1', { value: 3, js: 0 });
  assert.equal(offset.value, 5, 'the mirror predates the write');

  kernel.mirror.set('m1', { value: 7, js: 1 });
  assert.equal(offset.value, 7, 'the UI thread moved it since');
  assert.equal(kernel.reads.whole, 0, 'a number is read alone');

  const parses = kernel.host.__kuito.stats().total.jsonParses;

  kernel.mirror.set('m1', { value: '#ffffff', js: 1 });
  assert.equal(offset.value, '#ffffff', 'anything else is read whole');
  assert.equal(kernel.host.__kuito.stats().total.jsonParses, parses, 'with no JSON parsed');
});

test('a prop the compiler rejected runs on the JS thread and follows the value; the report says why', async () => {
  const kernel = make();
  const { __kuitoThreadRejected } = kernel.threads;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(10);
    const width = __kuitoThreadRejected(
      () => Number(offset.value) * 2,
      'constructs Thing (app.tsx:4:7)',
    );

    return kernel.host.__kuitoJSX('Box', { id: 'card', width });
  });

  await kernel.settle();

  assert.deepEqual(kernel.sent('card', 'width'), [20]);
  assert.deepEqual(kernel.ops('watch'), [{ op: 'watch', id: 'm1' }]);

  // The compiler's placement report already names it (docs/placement.md).
  assert.deepEqual(
    kernel.logs.filter(([level]) => level === 'warn'),
    [],
  );

  nativeEvent(kernel.host.__kuito, '__kuito.ui\u001f' + JSON.stringify({ w: [['m1', 30]] }));

  assert.deepEqual(kernel.sent('card', 'width'), [20, 60]);
});

test('watched values moved in one UI-thread frame apply in one transaction', async () => {
  const kernel = make();
  const { __kuitoThreadRejected } = kernel.threads;

  kernel.render(() => {
    const x = kernel.threads.__kuito.useMotion(1);
    const y = kernel.threads.__kuito.useMotion(2);
    const width = __kuitoThreadRejected(
      () => Number(x.value) * 10 + Number(y.value),
      'constructs Thing (app.tsx:5:7)',
    );

    return kernel.host.__kuitoJSX('Box', { id: 'card', width });
  });

  await kernel.settle();

  assert.deepEqual(kernel.sent('card', 'width'), [12]);

  nativeEvent(
    kernel.host.__kuito,
    '__kuito.ui\u001f' +
      JSON.stringify({
        w: [
          ['m1', 3],
          ['m2', 4],
          ['m9', 5],
        ],
      }),
  );

  assert.deepEqual(kernel.sent('card', 'width'), [12, 34], 'once, with both; a freed value drops');
});

test('a capture that cannot cross threads keeps the prop on the JS thread', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(1);
    const cache = new Map([['scale', 2]]);
    const scale = __kuitoThread(
      () => Number(offset.value) * Number(cache.get('scale')),
      'tf_scale',
      () => [offset, cache],
      [
        ['offset', 'read'],
        ['cache', 'call'],
      ],
    );

    return kernel.host.__kuitoJSX('Box', { id: 'card', scale });
  });

  await kernel.settle();

  assert.deepEqual(kernel.sent('card', 'scale'), [2]);

  assert.match(
    kernel.logs.find(([level]) => level === 'warn')?.[1] ?? '',
    /^Box scale reads a motion value but runs on the JS thread, a frame late: it captures cache, which cannot cross threads \(An object with a prototype/,
  );
});

test('using the result of a JS-thread function keeps the prop on the JS thread', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  const format = (value: unknown) => Number(value) / 2;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(8);
    const opacity = __kuitoThread(
      () => format(offset.value),
      'tf_format',
      () => [format, offset],
      [
        ['format', 'callResult'],
        ['offset', 'read'],
      ],
    );

    return kernel.host.__kuitoJSX('Box', { id: 'card', opacity });
  });

  await kernel.settle();

  assert.deepEqual(kernel.sent('card', 'opacity'), [4]);

  assert.match(
    kernel.logs.find(([level]) => level === 'warn')?.[1] ?? '',
    /it uses the result of format, a JS-thread function/,
  );
});

test('a handler that writes a motion value runs on the UI thread; its JS calls come back', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  const tracked: unknown[] = [];
  const track = (y: unknown) => tracked.push(y);

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(0);
    const onScroll = __kuitoThread(
      (event: { contentOffset: { y: number } }) => {
        offset.value = event.contentOffset.y;
        track(event.contentOffset.y);
      },
      'tf_scroll',
      () => [offset, track],
      [
        ['offset', 'write'],
        ['track', 'call'],
      ],
    );

    return kernel.host.__kuitoJSX('Scroll', { id: 'feed', onScroll });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('handler'), [
    {
      op: 'handler',
      key: handleOf(kernel.host.__kuito, 'feed') + '.scroll',
      fn: { $t: 'tf_scroll', c: [{ $m: 'm1' }, { $j: 1 }] },
    },
  ]);

  assert.deepEqual(kernel.sent('feed', 'emitsScroll'), [true]);
  assert.deepEqual(kernel.sent('feed', 'scrollInterval'), [0], 'every frame, not every 50ms');

  nativeEvent(kernel.host.__kuito, '__kuito.ui\u001f' + JSON.stringify({ f: 1, args: [42] }));

  assert.deepEqual(tracked, [42]);
});

test('onChange on the UI thread receives the text, as on the JS thread', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const latest = kernel.threads.__kuito.useMotion('');
    const onChange = __kuitoThread(
      (text: string) => {
        latest.value = text;
      },
      'tf_text',
      () => [latest],
      [['latest', 'write']],
    );

    return kernel.host.__kuitoJSX('TextField', { id: 'field', onChange });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('handler'), [
    {
      op: 'handler',
      key: handleOf(kernel.host.__kuito, 'field') + '.change',
      field: 'text',
      fn: { $t: 'tf_text', c: [{ $m: 'm1' }] },
    },
  ]);
});

test('a handler that touches no motion value stays on the JS thread', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  let presses = 0;

  kernel.render(() => {
    const onPress = __kuitoThread(
      () => {
        presses++;
      },
      'tf_press',
      () => [],
      [],
    );

    return kernel.host.__kuitoJSX('Pressable', { id: 'button', onPress });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('handler'), []);

  nativeEvent(kernel.host.__kuito, 'button.press');

  assert.equal(presses, 1);
});

test('signal writes from the UI thread update the signal', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(0);
    const label = kernel.host.__kuito.useState('idle');
    const onScroll = __kuitoThread(
      () => {
        offset.value = 1;
        label.value = 'scrolled';
      },
      'tf_label',
      () => [offset, label],
      [
        ['offset', 'write'],
        ['label', 'write'],
      ],
    );

    return kernel.host.__kuitoJSX('Scroll', {
      id: 'feed',
      onScroll,
      label: () => label.value,
    });
  });

  await kernel.settle();

  const [handler] = kernel.ops('handler');

  assert.deepEqual(handler.fn, { $t: 'tf_label', c: [{ $m: 'm1' }, { $s: 1, v: 'idle' }] });

  nativeEvent(
    kernel.host.__kuito,
    '__kuito.ui\u001f' + JSON.stringify({ s: 1, value: 'scrolled' }),
  );

  assert.deepEqual(kernel.sent('feed', 'label'), ['idle', 'scrolled']);
});

test('removing a view unbinds its props; disposing a module removes its handlers', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  const show = (initial: boolean) => kernel.host.__kuito.useState(initial);
  let visible: { value: boolean } | undefined;

  kernel.render(() => {
    visible = show(true);

    const offset = kernel.threads.__kuito.useMotion(0);
    const onScroll = __kuitoThread(
      () => {
        offset.value = 2;
      },
      'tf_s',
      () => [offset],
      [['offset', 'write']],
    );

    return kernel.host.__kuitoJSX(
      'Scroll',
      { id: 'feed', onScroll },
      kernel.host.__kuitoJSX(
        'Show',
        { when: () => visible?.value },
        kernel.host.__kuitoJSX('Box', { id: 'card', translateY: () => offset }),
      ),
    );
  });

  await kernel.settle();
  assert.ok(visible);

  visible.value = false;
  await kernel.settle();

  assert.deepEqual(kernel.ops('unbind'), [
    { op: 'unbind', view: handleOf(kernel.host.__kuito, 'card'), prop: 'translateY' },
  ]);

  kernel.host.__kuito.dispose('app');
  await kernel.settle();

  assert.deepEqual(kernel.ops('unhandle'), [
    { op: 'unhandle', key: handleOf(kernel.host.__kuito, 'feed') + '.scroll' },
  ]);
});

test('without a UI runtime, motion values work on the JS thread', async () => {
  const kernel = make({ ui: false });
  let offset: Motion | undefined;

  kernel.render(() => {
    offset = kernel.threads.__kuito.useMotion(1);

    return kernel.host.__kuitoJSX('Box', { id: 'card', opacity: () => offset?.value });
  });

  assert.ok(offset);

  offset.value = 0.5;
  await kernel.settle();

  assert.deepEqual(kernel.sent('card', 'opacity'), [1, 0.5]);
  assert.deepEqual(kernel.logs, []);
});

test("a UI-thread scroll handler keeps the app's own scrollInterval", async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(0);
    const onScroll = __kuitoThread(
      () => {
        offset.value = 1;
      },
      'tf_throttled',
      () => [offset],
      [['offset', 'write']],
    );

    return kernel.host.__kuitoJSX('Scroll', {
      id: 'feed',
      onScroll,
      scrollInterval: 100,
    });
  });

  await kernel.settle();

  assert.deepEqual(kernel.sent('feed', 'scrollInterval'), [100]);
});

test('an animation assigned on the JS thread runs on the UI thread', async () => {
  const kernel = make();
  const ended: boolean[] = [];
  let offset: Motion | undefined;

  kernel.render(() => {
    offset = kernel.threads.__kuito.useMotion(0);

    return kernel.host.__kuitoJSX('Box', { id: 'card', translateY: () => offset });
  });

  assert.ok(offset);

  offset.value = spring({ onEnd: (finished) => ended.push(finished) }).to(120);

  assert.equal(offset.value, 0, 'it reads where it is until the UI thread moves it');
  await kernel.settle();

  const [animated] = kernel.ops('motion').filter((operation) => operation.version === 1);

  assert.equal(animated.id, 'm1');

  assert.deepEqual(animated.value, {
    target: 120,
    __kuitoAnimation: { ...JSON.parse(JSON.stringify(spring().to(120).__kuitoAnimation)) },
    onEnd: { $j: 1 },
  });

  nativeEvent(kernel.host.__kuito, '__kuito.ui\u001f' + JSON.stringify({ f: 1, args: [true] }));
  assert.deepEqual(ended, [true]);
});

test('without a UI runtime, an animation jumps to where it ends', async () => {
  const kernel = make({ ui: false });
  const ended: boolean[] = [];
  let offset: Motion | undefined;

  kernel.render(() => {
    offset = kernel.threads.__kuito.useMotion(0);

    return kernel.host.__kuitoJSX('Box', { id: 'card', opacity: () => offset?.value });
  });

  assert.ok(offset);

  offset.value = timing({ easing: easing.linear, onEnd: (finished) => ended.push(finished) }).to(1);
  assert.equal(offset.value, 1);

  offset.value = sequence(timing().to(5), spring().to(2));
  assert.equal(offset.value, 2);

  offset.value = decay({ velocity: 300 });
  assert.equal(offset.value, 2, 'a decay has no end it can know');

  await kernel.settle();
  assert.deepEqual(ended, [true]);
});

test('a motion value is freed on both threads when its component unmounts', async () => {
  const kernel = make();
  const { __kuitoJSX: jsx } = kernel.host;
  let shown = true;

  function Card() {
    const offset = kernel.threads.__kuito.useMotion(0, 'offset');

    return jsx('Box', { id: 'card', translateY: () => offset });
  }

  const render = () =>
    kernel.host.__kuito.patch('app', (api) =>
      api.render(jsx('VStack', { id: 'root' }, shown ? jsx(Card, {}) : null)),
    );

  render();
  await kernel.settle();

  const [created] = kernel.ops('motion');

  shown = false;
  render();
  await kernel.settle();

  assert.deepEqual(kernel.ops('free'), [{ op: 'free', id: created.id }]);
});

test('a motion value follows a gesture with no handler, and lets go as the gesture says', async () => {
  const kernel = make();

  kernel.render(() => {
    const drag = pan({ axis: 'x' }).release(spring());
    const x = followed(kernel.threads.__kuito.useMotion(0)).follows(drag.x);

    return kernel.host.__kuitoJSX('Box', { id: 'card', translateX: () => x, gestures: [drag] });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('follow'), [
    { op: 'follow', id: 'm1', gesture: 1, field: 'x', home: 0 },
  ]);

  const [handler] = kernel.ops('handler');

  assert.deepEqual(handler.gestures, [
    {
      tag: 1,
      type: 'pan',
      kind: 'pan',
      gesture: 1,
      callbacks: {},
      releasing: JSON.parse(JSON.stringify(spring())),
    },
  ]);

  assert.deepEqual(kernel.ops('bind')[0].source, { $m: 'm1' });
});

test('derived motion binds on the UI thread: interpolate, clamp and map', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const x = followed(kernel.threads.__kuito.useMotion(0));
    const fade = __kuitoThread(
      (v: number) => 1 - v / 200,
      'tf_fade',
      () => [],
      [],
    ) as (value: number) => number;

    return kernel.host.__kuitoJSX('Box', {
      id: 'card',
      opacity: () => interpolate(x as never, [0, 100], [1, 0]),
      translateX: () => clamp(x as never, 0, 300),
      scale: () => x.map(fade),
    });
  });

  await kernel.settle();

  assert.deepEqual(
    kernel.ops('bind').map((operation) => [operation.prop, operation.source]),
    [
      [
        'opacity',
        {
          $d: {
            from: { $m: 'm1' },
            op: 'interpolate',
            input: [0, 100],
            output: [1, 0],
            extrapolate: 'clamp',
          },
        },
      ],
      ['translateX', { $d: { from: { $m: 'm1' }, op: 'clamp', min: 0, max: 300 } }],
      ['scale', { $d: { from: { $m: 'm1' }, op: 'map', fn: { $t: 'tf_fade', c: [] } } }],
    ],
  );
});

test('a map the compiler could not place runs on the JS thread and says why', async () => {
  const kernel = make();
  let x: Followed | undefined;

  kernel.render(() => {
    x = followed(kernel.threads.__kuito.useMotion(0));

    const motion = x;

    return kernel.host.__kuitoJSX('Box', {
      id: 'card',
      opacity: () => motion.map((v) => v / 2),
    });
  });

  await kernel.settle();
  assert.ok(x);

  assert.deepEqual(kernel.ops('bind'), []);

  assert.match(
    kernel.logs.find(([level]) => level === 'warn')?.[1] ?? '',
    /Box opacity reads a motion value but runs on the JS thread, a frame late: it maps with a function that was not compiled for the UI thread/,
  );

  x.value = 10;
  await kernel.settle();
  assert.deepEqual(kernel.sent('card', 'opacity').slice(-1), [5]);
});

test('race(tap, longPress) gives both platforms one contract, and one of them wins', async () => {
  const kernel = make();
  const calls: string[] = [];

  kernel.render(() =>
    kernel.host.__kuitoJSX('Box', {
      id: 'card',
      gestures: [
        race(
          tap({ onEnd: () => calls.push('tap') }),
          longPress({ after: 400, onStart: () => calls.push('long press') }),
        ),
      ],
    }),
  );

  await kernel.settle();

  // Both renderers take this as it is (docs/motion.md, Native contract):
  // racing gestures name no relation, so the first to activate wins.
  const [contract] = kernel.sent('card', 'gestures');

  assert.deepEqual(contract, [
    { tag: 1, type: 'tap', config: {}, waitFor: [], simultaneousHandlers: [], blocksHandlers: [] },
    {
      tag: 2,
      type: 'longPress',
      config: { minDurationMs: 400 },
      waitFor: [],
      simultaneousHandlers: [],
      blocksHandlers: [],
    },
  ]);

  // What each platform's recognizers report for a quick press, then a hold.
  const ui = installUIKernel();

  ui.send(...kernel.operations);

  const view = handleOf(kernel.host.__kuito, 'card');
  const send = (tag: number, state: number, oldState: number) =>
    ui.ui.event(
      view,
      'gesture',
      JSON.stringify({ handlerTag: tag, state, oldState, numberOfPointers: 1, pointerType: 0 }),
    );

  send(1, State.BEGAN, State.UNDETERMINED);
  send(2, State.BEGAN, State.UNDETERMINED);
  send(1, State.ACTIVE, State.BEGAN);
  send(1, State.END, State.ACTIVE);
  send(2, State.FAILED, State.BEGAN);

  send(1, State.BEGAN, State.UNDETERMINED);
  send(2, State.BEGAN, State.UNDETERMINED);
  send(2, State.ACTIVE, State.BEGAN);
  send(1, State.CANCELLED, State.BEGAN);
  send(2, State.END, State.ACTIVE);

  for (const message of ui.sent.splice(0))
    kernel.host.__kuito.dispatch(0, 'ui', JSON.stringify(message));

  assert.deepEqual(calls, ['tap', 'long press']);
});

test("a Pressable's press runs on the UI thread; one bubbling from a Pressable inside is sent there", async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const on = kernel.threads.__kuito.useMotion(false);
    const onPress = __kuitoThread(
      () => {
        on.value = !on.value;
      },
      'tf_toggle',
      () => [on],
      [['on', 'read', 'write']],
    );

    return kernel.host.__kuitoJSX(
      'Pressable',
      { id: 'card', label: 'Card', onPress },
      kernel.host.__kuitoJSX('Pressable', { id: 'badge', label: 'Badge' }),
    );
  });

  await kernel.settle();

  const card = handleOf(kernel.host.__kuito, 'card');

  assert.deepEqual(kernel.ops('handler'), [
    { op: 'handler', key: card + '.press', fn: { $t: 'tf_toggle', c: [{ $m: 'm1' }] } },
  ]);

  const touch = { locationX: 4, locationY: 5, pageX: 4, pageY: 5 };

  nativeEvent(kernel.host.__kuito, 'badge.press\u001f' + JSON.stringify(touch));
  await kernel.settle();

  assert.deepEqual(kernel.ops('dispatch'), [
    { op: 'dispatch', view: card, event: 'press', payload: touch },
  ]);
});

test("a label that reads a motion value is joined on the UI thread from its children's UI copies", async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const taps = kernel.threads.__kuito.useMotion(0);
    const count = () => taps.value;

    __kuitoThread(count, 'tf_taps', () => [taps], [['taps', 'read']]);

    return kernel.host.__kuitoJSX(
      'Text',
      { id: 'label' },
      kernel.host.__kuitoExpr('count', count),
      ' taps',
    );
  });

  await kernel.settle();

  assert.deepEqual(
    kernel.ops('bind').map(({ prop, source }) => [prop, source]),
    [['text', [{ $t: 'tf_taps', c: [{ $m: 'm1' }] }, ' taps']]],
  );

  assert.deepEqual(kernel.sent('label', 'text'), [], 'the JS thread never writes it');
});

test('a handler that calls a function moving a motion value runs on the UI thread too', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;

  kernel.render(() => {
    const likes = kernel.threads.__kuito.useMotion(0);
    const like = () => {
      likes.value = Number(likes.value) + 1;
    };

    __kuitoThread(like, 'tf_like', () => [likes], [['likes', 'read', 'write']]);

    // What a component like Reel's Action does with the handler it is given.
    const props = { onPress: like };
    const onPress = __kuitoThread(
      () => props.onPress(),
      'tf_action',
      () => [props.onPress],
      [['props.onPress', 'call']],
    );

    return kernel.host.__kuitoJSX('Pressable', { id: 'like', label: 'Like', onPress });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('handler'), [
    {
      op: 'handler',
      key: handleOf(kernel.host.__kuito, 'like') + '.press',
      fn: { $t: 'tf_action', c: [{ $t: 'tf_like', c: [{ $m: 'm1' }] }] },
    },
  ]);
});

interface Linking {
  linkMotion(id: number, name: string): { value: unknown };
}

/** What the platform sends the JS thread for an observed member. */
const emitted = (host: object, id: number, value: unknown) =>
  Reflect.apply(Reflect.get(host, '__kuitoLinkEmit') as never, host, [id, value]);

const linking = (kuito: unknown): Linking => kuito as never;

test('a module motion value is the platform’s: bound on the UI thread, read here from what it sends', async () => {
  const kernel = make();
  const observed: unknown[][] = [];

  Object.assign(kernel.host, {
    __kuitoHostObserve: (id: number, on: boolean) => observed.push([id, on]),
  });

  const fix = linking(kernel.host.__kuito).linkMotion(7, 'Tracker.fix');

  assert.deepEqual(observed, [], 'nothing starts until the app uses it');
  assert.deepEqual(kernel.operations, []);

  kernel.render(() => kernel.host.__kuitoJSX('Box', { id: 'dot', translateX: () => fix }));
  await kernel.settle();

  assert.deepEqual(observed, [[7, true]]);
  assert.deepEqual(kernel.ops('linked'), [{ op: 'linked', id: 'l7', value: null }]);

  assert.deepEqual(
    kernel.ops('bind').map(({ prop, source }) => [prop, source]),
    [['translateX', { $m: 'l7' }]],
  );

  // What the platform also sends the JS thread, for code that reads it here.
  emitted(kernel.host, 7, 12);

  assert.equal(fix.value, 12);
  assert.deepEqual(kernel.ops('motion'), [], 'the JS thread never writes it back');
  assert.throws(() => (fix.value = 3), /Tracker\.fix is the platform's/);
});

test('keyboard.frame is a motion value the UI thread moves from the keyboard’s own events', async () => {
  const kernel = make();
  const kuito = kernel.host.__kuito as unknown as {
    keyboard: { frameMotion(): { value: unknown } };
  };
  const frame = kuito.keyboard.frameMotion();

  kernel.render(() => kernel.host.__kuitoJSX('Box', { id: 'bar', translateY: () => frame }));
  await kernel.settle();

  assert.deepEqual(kernel.ops('keyboard'), [{ op: 'keyboard', id: 'keyboard', value: null }]);

  const shown = { screenX: 0, screenY: 500, width: 400, height: 300, duration: 250 };

  nativeEvent(kernel.host.__kuito, '__kuito:keyboard.didshow\u001f' + JSON.stringify(shown));

  assert.deepEqual(JSON.parse(JSON.stringify(frame.value)), {
    screenX: 0,
    screenY: 500,
    width: 400,
    height: 300,
  });
});

test('a handler that only calls a main-thread module function runs on the UI thread', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  const kuito = kernel.host.__kuito as unknown as {
    link(id: number, name: string, thread: string, schema: unknown[], direct?: boolean): unknown;
  };
  const selection = kuito.link(4, 'Haptics.selection', 'main', [], true);

  kernel.render(() => {
    const onPress = () => void Reflect.apply(selection as never, undefined, []);

    __kuitoThread(onPress, 'tf_tick', () => [selection], [['haptics.selection', 'call']]);

    return kernel.host.__kuitoJSX('Pressable', { id: 'tick', label: 'Tick', onPress });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('handler'), [
    {
      op: 'handler',
      key: handleOf(kernel.host.__kuito, 'tick') + '.press',
      fn: { $t: 'tf_tick', c: [{ $l: 4 }] },
    },
  ]);
});

test('a capture that reads a motion value as it is now keeps the code on the JS thread, following it', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  let x: Motion | undefined;

  kernel.render(() => {
    const offset = kernel.threads.__kuito.useMotion(1);
    // A component's props read through getters: `props.text` is computed from `offset` now.
    const props = {
      get text() {
        return 'at ' + String(offset.value);
      },
    };
    const label = () => props.text;

    x = offset;
    __kuitoThread(label, 'tf_label', () => [props.text], [['props.text', 'read']]);

    return kernel.host.__kuitoJSX('Text', { id: 'label' }, kernel.host.__kuitoExpr('l', label));
  });

  await kernel.settle();
  assert.ok(x);

  assert.deepEqual(kernel.ops('bind'), [], 'a UI copy would show it as it was');
  assert.deepEqual(kernel.sent('label', 'text'), ['at 1']);

  x.value = 2;
  await kernel.settle();
  assert.deepEqual(kernel.sent('label', 'text'), ['at 1', 'at 2']);
});

test('functions that call each other cross, the inner one naming the outer', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  // As effects.ts's makeEffect and parallelEffects call each other.
  const even = (n: number): boolean => (n === 0 ? true : odd(n - 1));
  const odd = (n: number): boolean => (n === 0 ? false : even(n - 1));

  __kuitoThread(even, 'tf_even', () => [odd], [['odd', 'callResult']]);
  __kuitoThread(odd, 'tf_odd', () => [even], [['even', 'callResult']]);

  kernel.render(() => {
    const on = kernel.threads.__kuito.useMotion(0);
    const onPress = () => {
      on.value = even(4) ? 1 : 0;
    };

    __kuitoThread(onPress, 'tf_press', () => [on, even], [
      ['on', 'write'],
      ['even', 'callResult'],
    ]);

    return kernel.host.__kuitoJSX('Pressable', { id: 'p', label: 'P', onPress });
  });

  await kernel.settle();

  assert.deepEqual(
    kernel.ops('handler').map(({ fn }) => fn),
    [
      {
        $t: 'tf_press',
        c: [{ $m: 'm1' }, { $t: 'tf_even', c: [{ $t: 'tf_odd', c: [{ $r: 'tf_even' }] }] }],
      },
    ],
  );
});

test("using the result of a captured object's JS-thread method keeps the handler on the JS thread", async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  const seeks: unknown[] = [];

  kernel.render(() => {
    const duration = kernel.threads.__kuito.useMotion(60);
    // As audio's player: motion values beside methods that answer on the JS thread.
    const player = {
      duration,
      seek: (seconds: unknown) => {
        seeks.push(seconds);

        return Promise.resolve();
      },
    };
    const onPress = () => void player.seek(Number(player.duration.value) - 5).catch(() => {});

    __kuitoThread(onPress, 'tf_seek', () => [player, player.duration], [
      ['player', 'callResult'],
      ['player.duration', 'read'],
    ]);

    return kernel.host.__kuitoJSX('Pressable', { id: 'end', label: 'End', onPress });
  });

  await kernel.settle();

  assert.deepEqual(kernel.ops('handler'), [], 'its UI copy would get nothing back from seek');

  nativeEvent(kernel.host.__kuito, 'end.press');
  assert.deepEqual(seeks, [55]);
});
