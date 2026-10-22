import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { decay, spring, timing } from '../src/runtime/animation-specs.ts';
import { createGestureDispatcher, type Follower } from '../src/runtime/gesture-events.ts';
import {
  State,
  fling,
  longPress,
  pan,
  pinch,
  prepareGestures,
  race,
  rotate,
  tap,
  orElse,
  together,
  touches,
  type Gesture,
} from '../src/runtime/gesture-specs.ts';
import { make } from './support/thread-kernel.ts';
import { handleOf, nativeEvent } from './support/host-wire.ts';

// Runtime values come from the VM's realm; compare their data, not prototypes.
const data = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Tags as the kernel assigns them: one per gesture, in the order they are met. */
function tagger() {
  const tags = new Map<Gesture, number>();

  return (gesture: Gesture) => {
    if (!tags.has(gesture)) tags.set(gesture, tags.size + 1);

    return tags.get(gesture) ?? 0;
  };
}

test('gestures are values; their options set RNGH native config keys', () => {
  assert.deepEqual(data(pan({ axis: 'x', minDistance: 4, disabled: true }).config), {
    activeOffsetXStart: -10,
    activeOffsetXEnd: 10,
    failOffsetYStart: -10,
    failOffsetYEnd: 10,
    minDist: 4,
    enabled: false,
  });

  assert.deepEqual(data(tap({ count: 2, maxDuration: 300, maxDistance: 5 }).config), {
    numberOfTaps: 2,
    maxDurationMs: 300,
    maxDist: 5,
  });

  assert.deepEqual(data(longPress({ after: 600, maxDistance: 12 }).config), {
    minDurationMs: 600,
    maxDist: 12,
  });

  assert.deepEqual(data(fling({ direction: ['left', 'up'] }).config), { direction: 6 });
  assert.deepEqual(data(fling().config), {}, 'right by default, as RNGH');
  assert.deepEqual(data(touches().config), { minDist: 0 }, 'raw touches: a pan from the first one');
  assert.equal(touches().type, 'pan');
  assert.equal(pinch().type, 'pinch');
  assert.equal(rotate().type, 'rotation');

  assert.deepEqual(data(pan({ hitArea: { horizontal: 8 } }).config), {
    hitSlop: { horizontal: 8 },
  });

  assert.deepEqual(data(tap({ disabled: false, hitArea: 4 }).config), {
    enabled: true,
    hitSlop: 4,
  });

  assert.throws(() => pan({ enabled: false } as never), /pan takes no option enabled/);
  assert.throws(() => pan({ hitSlop: 8 } as never), /pan takes no option hitSlop/);

  assert.throws(() => pan({ axis: 'z' as never }), /pan axis must be 'x' or 'y'/);
  assert.throws(() => tap({ count: Number.NaN }), /tap count must be a number/);

  assert.throws(
    () => fling({ direction: 'sideways' as never }),
    /fling direction takes 'left', 'right', 'up' or 'down'/,
  );
});

test('callbacks for what needs JavaScript come with the options', () => {
  const onEnd = () => {};
  const drag = pan({ onEnd });

  assert.equal(drag.callbacks.onEnd, onEnd);
  assert.deepEqual(Object.keys(drag.callbacks), ['onEnd']);
  assert.throws(() => pan({ onStart: 'later' as never }), /pan onStart must be a function/);
});

test('a gesture names the values it moves; release says how they let go', () => {
  const drag = pan();
  const released = drag.release(spring());

  assert.notEqual(released, drag, 'release makes a new gesture');
  assert.deepEqual(data(released.releasing), data(spring()));
  assert.equal(drag.releasing, undefined);

  assert.equal(released.x.__kuitoSource.gesture, released);
  assert.equal(released.x.__kuitoSource.field, 'x');
  assert.equal(drag.y.__kuitoSource.field, 'y');
  assert.equal(pinch().scale.__kuitoSource.field, 'scale');
  assert.equal(rotate().rotation.__kuitoSource.field, 'rotation');
  assert.equal(touches().x.__kuitoSource.field, 'x');
  assert.equal(longPress().active.__kuitoSource.field, 'active');

  assert.deepEqual(Object.keys(data(drag)).sort(), [
    '__kuitoGesture',
    'callbacks',
    'config',
    'kind',
    'type',
  ]);
});

test('race, together and orElse become per-gesture relations, as RNGH prepares them', () => {
  const single = tap();
  const double = tap({ count: 2 });
  const drag = pan();
  const zoom = pinch();
  const tag = tagger();
  const prepared = prepareGestures(race(orElse(double, single), together(drag, zoom)), tag);

  assert.deepEqual(
    prepared.map((entry) => [entry.tag, entry.type, entry.waitFor, entry.simultaneousHandlers]),
    [
      [tag(double), 'tap', [], []],
      [tag(single), 'tap', [tag(double)], []],
      [tag(drag), 'pan', [], [tag(zoom)]],
      [tag(zoom), 'pinch', [], [tag(drag)]],
    ],
  );

  assert.throws(() => race(drag, 'tap' as never), /race takes gestures/);
});

// --- From native events to callbacks and motion values ----------------------

type Call = [string, ...unknown[]];

function record() {
  const calls: Call[] = [];
  const callback =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push([name, ...args]);

  return { calls, callback };
}

const event = (state: number, extra: Record<string, unknown> = {}, oldState?: number) => ({
  handlerTag: 1,
  state,
  numberOfPointers: 1,
  pointerType: 0,
  ...(oldState !== undefined && { oldState }),
  ...extra,
});

test('state changes and updates become onStart, onChange and onEnd', () => {
  const { calls, callback } = record();
  const dispatch = createGestureDispatcher(
    [
      {
        tag: 1,
        type: 'pan',
        kind: 'pan',
        gesture: 1,
        callbacks: {
          onStart: callback('start'),
          onChange: callback('change'),
          onEnd: callback('end'),
        },
      },
    ],
    () => [],
  );

  dispatch(event(State.BEGAN, {}, State.UNDETERMINED));
  dispatch(event(State.ACTIVE, {}, State.BEGAN));
  dispatch(event(State.ACTIVE, { translationX: 5 }));
  dispatch(event(State.END, {}, State.ACTIVE));

  assert.deepEqual(
    calls.map(([name, ...args]) => [name, ...args.slice(1)]),
    [['start'], ['change'], ['end', true]],
  );
});

test('a gesture that fails before activating calls nothing', () => {
  const { calls, callback } = record();
  const dispatch = createGestureDispatcher(
    [{ tag: 1, type: 'tap', kind: 'tap', gesture: 1, callbacks: { onEnd: callback('end') } }],
    () => [],
  );

  dispatch(event(State.BEGAN, {}, State.UNDETERMINED));
  dispatch(event(State.FAILED, {}, State.BEGAN));

  assert.deepEqual(calls, []);
});

test('onChange carries the change since the last update; rotation is in degrees', () => {
  const changes: unknown[] = [];
  const dispatch = createGestureDispatcher(
    [
      {
        tag: 1,
        type: 'pan',
        kind: 'pan',
        gesture: 1,
        callbacks: { onChange: (change: { changeX: number }) => changes.push(change.changeX) },
      },
      {
        tag: 2,
        type: 'rotation',
        kind: 'rotation',
        gesture: 2,
        callbacks: {
          onChange: (change: { rotation: number; rotationChange: number }) =>
            changes.push([change.rotation, change.rotationChange]),
        },
      },
    ],
    () => [],
  );

  dispatch(event(State.ACTIVE, {}, State.BEGAN));
  dispatch(event(State.ACTIVE, { translationX: 4 }));
  dispatch(event(State.ACTIVE, { translationX: 10 }));
  dispatch({ ...event(State.ACTIVE, {}, State.BEGAN), handlerTag: 2 });
  dispatch({ ...event(State.ACTIVE, { rotation: Math.PI / 2 }), handlerTag: 2 });

  assert.deepEqual(changes, [4, 6, [90, 90]]);
});

/** A motion value as the dispatcher moves it, recording what it is given. */
function follower(field: string, start = 0, home = start): Follower & { log: unknown[] } {
  let value: unknown = start;
  const log: unknown[] = [];

  return {
    key: {},
    field,
    home,
    log,
    read: () => value,
    stop() {},
    write(next: unknown) {
      value = next;
      log.push(next);
    },
    animate(animation: unknown) {
      log.push(animation);
    },
  };
}

test('followers move with the fields they follow, from where each one was', () => {
  const x = follower('x', 30);
  const scale = follower('scale', 2);
  const at = follower('x');
  const active = follower('active');
  const dispatch = createGestureDispatcher(
    [
      { tag: 1, type: 'pan', kind: 'pan', gesture: 1, callbacks: {} },
      { tag: 2, type: 'pinch', kind: 'pinch', gesture: 2, callbacks: {} },
      { tag: 3, type: 'pan', kind: 'touches', gesture: 3, callbacks: {} },
    ],
    (gesture) => ({ 1: [x, active], 2: [scale], 3: [at] })[gesture] ?? [],
  );

  dispatch(event(State.ACTIVE, {}, State.BEGAN));
  dispatch(event(State.ACTIVE, { translationX: 10 }));
  dispatch({ ...event(State.ACTIVE, {}, State.BEGAN), handlerTag: 2 });
  dispatch({ ...event(State.ACTIVE, { scale: 1.5 }), handlerTag: 2 });
  dispatch({ ...event(State.ACTIVE, {}, State.BEGAN), handlerTag: 3 });
  dispatch({ ...event(State.ACTIVE, { x: 120 }), handlerTag: 3 });
  dispatch(event(State.END, {}, State.ACTIVE));

  assert.deepEqual(x.log, [40], 'a pan adds its translation');
  assert.deepEqual(scale.log, [3], 'a pinch multiplies by its scale');
  assert.deepEqual(at.log, [120], 'touches are where the finger is');
  assert.deepEqual(active.log, [1, 0], 'active while the gesture is');
});

test('a release animates each follower with the gesture velocity, home by default', () => {
  const x = follower('x', 0, 0);
  const y = follower('y', 0, 5);
  const dispatch = createGestureDispatcher(
    [
      {
        tag: 1,
        type: 'pan',
        kind: 'pan',
        gesture: 1,
        callbacks: {},
        releasing: data(spring({ damping: 20 })),
      },
    ],
    () => [x, y],
  );

  dispatch(event(State.ACTIVE, {}, State.BEGAN));
  dispatch(event(State.ACTIVE, { translationX: 50, translationY: 20 }));
  dispatch(event(State.END, { velocityX: 800, velocityY: -300 }, State.ACTIVE));

  const released = (log: unknown[]) =>
    data(log[log.length - 1]) as {
      target: number;
      __kuitoAnimation: { velocity: number; damping: number };
    };

  assert.equal(released(x.log).target, 0, 'back home');
  assert.equal(released(x.log).__kuitoAnimation.velocity, 800, 'with the finger’s velocity');
  assert.equal(released(x.log).__kuitoAnimation.damping, 20);
  assert.equal(released(y.log).target, 5, 'each to its own home');
  assert.equal(released(y.log).__kuitoAnimation.velocity, -300);
});

test('a release keeps its own target, snap points and decay', () => {
  const snapping = follower('x');
  const coasting = follower('x');
  const timed = follower('x');
  const dispatch = createGestureDispatcher(
    [
      {
        tag: 1,
        type: 'pan',
        kind: 'pan',
        gesture: 1,
        callbacks: {},
        releasing: data(spring().to([0, 400])),
      },
      {
        tag: 2,
        type: 'pan',
        kind: 'pan',
        gesture: 2,
        callbacks: {},
        releasing: data(decay({ clamp: [0, 400] })),
      },
      {
        tag: 3,
        type: 'pan',
        kind: 'pan',
        gesture: 3,
        callbacks: {},
        releasing: data(timing(200).to(12)),
      },
    ],
    (gesture) => ({ 1: [snapping], 2: [coasting], 3: [timed] })[gesture] ?? [],
  );

  [1, 2, 3].forEach((tag) => {
    dispatch({ ...event(State.ACTIVE, {}, State.BEGAN), handlerTag: tag });
    dispatch({ ...event(State.END, { velocityX: 600 }, State.ACTIVE), handlerTag: tag });
  });

  const last = (log: unknown[]) =>
    data(log[log.length - 1]) as {
      target?: unknown;
      __kuitoAnimation: { velocity?: number; type: string };
    };

  assert.deepEqual(last(snapping.log).target, [0, 400]);
  assert.equal(last(snapping.log).__kuitoAnimation.velocity, 600);
  assert.equal(last(coasting.log).__kuitoAnimation.type, 'decay');
  assert.equal(last(coasting.log).__kuitoAnimation.velocity, 600);
  assert.equal(last(timed.log).target, 12);
});

// --- The gestures prop -------------------------------------------------------

const nativeGestures = (kernel: ReturnType<typeof make>, view: string) =>
  kernel
    .sent(view, 'gestures')
    .map((value) => (typeof value === 'string' ? JSON.parse(value) : value));

test('the gestures prop attaches native recognizers and UI-thread callbacks', async () => {
  const kernel = make();
  const { __kuitoThread } = kernel.threads;
  const logged: unknown[] = [];

  kernel.render(() => {
    const x = kernel.threads.__kuito.useMotion(0);
    const onChange = __kuitoThread(
      (change: { changeX: number }) => {
        x.value = Number(x.value) + change.changeX;
      },
      'tf_pan',
      () => [x],
      [['x', 'read', 'write']],
    );
    const drag = pan({
      axis: 'x',
      onChange: onChange as never,
      onEnd: (end: { velocityX: number }) => logged.push(end.velocityX),
    });

    return kernel.host.__kuitoJSX('Box', { id: 'card', gestures: [drag] });
  });

  await kernel.settle();

  assert.deepEqual(nativeGestures(kernel, 'card'), [
    [
      {
        tag: 1,
        type: 'pan',
        config: {
          activeOffsetXStart: -10,
          activeOffsetXEnd: 10,
          failOffsetYStart: -10,
          failOffsetYEnd: 10,
        },
        waitFor: [],
        simultaneousHandlers: [],
        blocksHandlers: [],
      },
    ],
  ]);

  assert.deepEqual(kernel.ops('handler'), [
    {
      op: 'handler',
      key: handleOf(kernel.host.__kuito, 'card') + '.gesture',
      gestures: [
        {
          tag: 1,
          type: 'pan',
          kind: 'pan',
          gesture: 1,
          callbacks: { onChange: { $t: 'tf_pan', c: [{ $m: 'm1' }] }, onEnd: { $j: 1 } },
        },
      ],
    },
  ]);

  nativeEvent(
    kernel.host.__kuito,
    '__kuito.ui\u001f' + JSON.stringify({ f: 1, args: [{ velocityX: 40 }, true] }),
  );

  assert.deepEqual(logged, [40]);
});

test('several gestures on a view race, unless composed otherwise', async () => {
  const kernel = make();

  kernel.render(() =>
    kernel.host.__kuitoJSX('Box', {
      id: 'photo',
      gestures: [together(pinch(), rotate()), tap()],
    }),
  );

  await kernel.settle();

  const [gestures] = nativeGestures(kernel, 'photo');
  const of = (type: string) => gestures.find((gesture: { type: string }) => gesture.type === type);

  assert.deepEqual(of('pinch').simultaneousHandlers, [of('rotation').tag]);
  assert.deepEqual(of('tap').simultaneousHandlers, []);
  assert.deepEqual(of('tap').waitFor, []);
});

test('tags stay across re-renders that make new gesture values; no gestures detaches', async () => {
  const kernel = make();
  let shown: { value: number } | undefined;

  kernel.render(() => {
    shown = kernel.host.__kuito.useState(1);

    const which = shown;

    return kernel.host.__kuitoJSX('Box', {
      id: 'card',
      // As compiled: a JSX expression arrives as a thunk.
      gestures: () => (which.value === 1 ? [tap()] : which.value === 2 ? [tap({ count: 1 })] : []),
    });
  });

  await kernel.settle();
  assert.ok(shown);

  shown.value = 2;
  await kernel.settle();
  shown.value = 3;
  await kernel.settle();

  assert.deepEqual(
    nativeGestures(kernel, 'card').map((value) => (value === null ? null : value[0].tag)),
    [1, 1, null],
  );

  assert.deepEqual(kernel.ops('unhandle'), [
    { op: 'unhandle', key: handleOf(kernel.host.__kuito, 'card') + '.gesture' },
  ]);
});

test('without a UI runtime, gestures and their followers run on the JS thread', async () => {
  const kernel = make({ ui: false });
  const calls: unknown[] = [];
  let x: { value: unknown } | undefined;

  kernel.render(() => {
    const drag = pan({ onEnd: () => calls.push('end') });

    x = kernel.threads.__kuito.useMotion(0);
    (x as unknown as { follows(source: unknown): unknown }).follows(drag.x);

    return kernel.host.__kuitoJSX('Box', {
      id: 'card',
      gestures: [race(tap({ onEnd: () => calls.push('tap') }), drag)],
    });
  });

  await kernel.settle();

  const [gestures] = nativeGestures(kernel, 'card');
  const tag = (type: string) =>
    gestures.find((gesture: { type: string }) => gesture.type === type).tag;
  const send = (payload: object) =>
    nativeEvent(kernel.host.__kuito, 'card.gesture\u001f' + JSON.stringify(payload));
  const base = { numberOfPointers: 1, pointerType: 0 };

  send({ ...base, handlerTag: tag('tap'), state: State.ACTIVE, oldState: State.BEGAN });
  send({ ...base, handlerTag: tag('tap'), state: State.END, oldState: State.ACTIVE });
  send({ ...base, handlerTag: tag('pan'), state: State.ACTIVE, oldState: State.BEGAN });
  send({ ...base, handlerTag: tag('pan'), state: State.ACTIVE, translationX: 25 });

  assert.equal(x?.value, 25, 'the follower moved on the JS thread');

  send({ ...base, handlerTag: tag('pan'), state: State.END, oldState: State.ACTIVE });
  assert.deepEqual(calls, ['tap', 'end']);
});

test('gestures takes gesture values, and event props one function', () => {
  const kernel = make();

  assert.throws(
    () => kernel.render(() => kernel.host.__kuitoJSX('Box', { id: 'card', gestures: ['pan'] })),
    /Box gestures takes gestures such as pan\(\) or tap\(\)/,
  );

  assert.throws(
    () =>
      kernel.render(() =>
        kernel.host.__kuitoJSX('TextField', { id: 'field', onChange: [() => {}, () => {}] }),
      ),
    /TextField onChange must be a function/,
  );
});
