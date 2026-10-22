import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { compileNativeCSS } from '../src/style/compiler.ts';
import { EASINGS } from '../src/style/properties.ts';
import { decay, easing, repeat, spring, timing } from '../src/runtime/animation-specs.ts';
import { delay, keyframes, parallel, sequence, stagger } from '../src/runtime/compose.ts';
import { fade, resolveEffect, slide, zoom } from '../src/runtime/effects.ts';
import { installUIKernel } from './support/ui-host.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { handleOf, hosting } from './support/host-wire.ts';

// Runtime values come from the VM's realm; compare their data, not prototypes.
const data = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type PropCall = [id: string, name: string, value: unknown];

function make() {
  const calls: PropCall[] = [];
  const removed: string[] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        // Objects cross as plain data (docs/native-scheduling.md#structured-props), never as text.
        assert.ok(
          value === null ||
            ['number', 'string', 'boolean'].includes(typeof value) ||
            (typeof value === 'object' && !(typeof value === 'string')),
          `${name} crosses as a scalar or plain data`,
        );

        calls.push([id, name, value]);
      },
      removeView(id: string) {
        removed.push(id);
      },
    }),
  );

  const render = (props: Props, show = true) =>
    host.__kuito.patch('anim', (api) =>
      api.render(show ? host.__kuitoJSX('Box', { id: 'card', ...props }) : null),
    );
  const sent = (name: string) =>
    calls.filter(([, key]) => key === name).map(([, key, value]) => [key, value]);

  return { host, kuito: host.__kuito, calls, removed, render, sent };
}

test('timing and spring describe how a value moves; .to gives it a target', () => {
  assert.deepEqual(data(timing()), {
    __kuitoAnimation: { type: 'timing', duration: 300, easing: [0.42, 0, 0.58, 1], delay: 0 },
  });

  assert.deepEqual(data(timing(200).to(0.5)), {
    target: 0.5,
    __kuitoAnimation: { type: 'timing', duration: 200, easing: [0.42, 0, 0.58, 1], delay: 0 },
  });

  assert.deepEqual(
    data(
      timing({ duration: 120, easing: easing.bezier(0.2, 0.8, 0.2, 1), delay: 40 }).to('#ff0000'),
    ),
    {
      target: '#ff0000',
      __kuitoAnimation: { type: 'timing', duration: 120, easing: [0.2, 0.8, 0.2, 1], delay: 40 },
    },
  );

  assert.deepEqual(data(spring({ damping: 14 }).__kuitoAnimation), {
    type: 'spring',
    damping: 14,
    stiffness: 100,
    mass: 1,
    velocity: 0,
    overshootClamping: false,
    energyThreshold: 6e-9,
    delay: 0,
  });

  const springy = spring();

  assert.equal(springy.to(1).target, 1);
  assert.equal(springy.target, undefined, '.to returns a new animation');
  assert.deepEqual(data(spring().to([0, 400])).target, [0, 400], 'several targets: snap points');

  assert.throws(() => timing(-1), /duration must be a non-negative number/);
  assert.throws(() => easing.bezier(1.5, 0, 0, 1), /^TypeError: easing\.bezier x values/);
  assert.throws(() => spring().to({} as never), /A target is a number, a color or a list of them/);
});

test('a spring that may not overshoot stops at its target', () => {
  const clamped = (overshoot: boolean) =>
    Reflect.get(data(spring({ overshoot }).__kuitoAnimation), 'overshootClamping');

  assert.equal(clamped(false), true);
  assert.equal(clamped(true), false);
});

test('a spring can be described by its duration instead of its physics', () => {
  assert.deepEqual(data(spring({ duration: 400 }).__kuitoAnimation), {
    type: 'spring',
    mass: 1,
    velocity: 0,
    overshootClamping: false,
    energyThreshold: 6e-9,
    duration: 400,
    dampingRatio: 0.5,
    delay: 0,
  });

  assert.throws(
    () => spring({ duration: 300, stiffness: 200 }),
    /either stiffness and damping, or duration and dampingRatio/,
  );
});

test('decay, sequence, repeat and delay compose animations as data', () => {
  assert.deepEqual(data(decay({ clamp: [0, 300], rubberBand: true })), {
    __kuitoAnimation: {
      type: 'decay',
      velocity: 0,
      deceleration: 0.998,
      velocityFactor: 1,
      clamp: [0, 300],
      rubberBand: true,
      rubberBandFactor: 0.6,
      delay: 0,
    },
  });

  const bounce = sequence(timing(100).to(1.2), spring().to(1));
  const spec = bounce.__kuitoAnimation;

  assert.deepEqual(spec.type === 'sequence' ? spec.steps.map((step) => step.target) : [], [1.2, 1]);

  assert.deepEqual(data(repeat(bounce, { count: 3, reverse: true }).__kuitoAnimation), {
    type: 'repeat',
    animation: data(bounce),
    count: 3,
    reverse: true,
    delay: 0,
  });

  assert.deepEqual(
    data(repeat(bounce).__kuitoAnimation),
    { type: 'repeat', animation: data(bounce), count: 0, reverse: false, delay: 0 },
    'forever by default',
  );

  assert.equal(delay(150, delay(50, spring().to(1))).__kuitoAnimation.delay, 200);

  assert.throws(() => decay({ velocity: Number.NaN }), /velocity must be a number/);
  assert.throws(() => decay({ rubberBand: true }), /rubberBand needs a clamp/);
  assert.throws(() => sequence(), /sequence needs at least one animation or effect/);

  assert.throws(
    () => sequence(fade, timing() as never),
    /sequence takes animations or effects, not both/,
  );
});

test('onEnd travels with the animation it belongs to', () => {
  const onEnd = (finished: boolean) => finished;

  assert.equal(timing({ onEnd }).to(1).onEnd, onEnd);
  assert.equal(repeat(spring().to(0), { count: 2, onEnd }).onEnd, onEnd);
  assert.throws(() => timing({ onEnd: 'later' as never }), /onEnd must be a function/);
});

test('easings match the ones the CSS compiler emits', () => {
  assert.deepEqual(data(easing.linear), EASINGS.linear);
  assert.deepEqual(data(easing.ease), EASINGS.ease);
  assert.deepEqual(data(easing.in), EASINGS['ease-in']);
  assert.deepEqual(data(easing.out), EASINGS['ease-out']);
  assert.deepEqual(data(easing.inOut), EASINGS['ease-in-out']);
});

test('keyframes of one value are a sequence of timings through its stops', () => {
  const pulse = keyframes({ 0: 1, 60: 1.2, 100: 1 }, { duration: 500, easing: easing.linear });
  const spec = data(pulse).__kuitoAnimation;

  assert.equal(spec.type, 'sequence');

  assert.deepEqual(
    spec.steps.map(({ target, __kuitoAnimation: step }) => [
      target,
      step.type === 'timing' && step.duration,
    ]),
    [
      [1, 0],
      [1.2, 300],
      [1, 200],
    ],
  );

  assert.throws(() => keyframes({ 50: 1 }), /keyframes need at least two stops/);
  assert.throws(() => keyframes({ 0: 1, 120: 2 }), /a keyframe is a percentage from 0 to 100/);
});

const rest = (prop: string) => ({ opacity: 1, translateY: 0, scale: 1 })[prop] ?? 0;
const how = (prop: string) =>
  (prop === 'opacity' ? timing(200) : spring({ duration: 400 })).__kuitoAnimation;

test('effects say where a view enters from and leaves to, composed with and', () => {
  const entering = resolveEffect(fade.and(slide.up(12)), 'enter', how, rest);

  assert.deepEqual(data(entering), {
    opacity: { from: 0, animation: { target: 1, __kuitoAnimation: how('opacity') } },
    translateY: { from: 12, animation: { target: 0, __kuitoAnimation: how('translateY') } },
  });

  const leaving = resolveEffect(parallel(fade, slide.up(12), zoom(0.5)), 'exit', how, rest);

  assert.deepEqual(
    Object.entries(data(leaving) as Record<string, { animation: { target: number } }>).map(
      ([prop, track]) => [prop, track.animation.target],
    ),
    [
      ['opacity', 0],
      ['translateY', -12],
      ['scale', 0.5],
    ],
    'slide.up enters rising into place and leaves rising away',
  );

  assert.throws(() => fade.and(fade), /fade and fade both move opacity/);
  assert.throws(() => slide.up(-1), /slide distance must be a non-negative number/);
});

test('delay, stagger and sequence place effects in time', () => {
  const at = (effect: Parameters<typeof resolveEffect>[0]) =>
    Object.fromEntries(
      Object.entries(
        data(resolveEffect(effect, 'enter', how, rest)) as Record<
          string,
          { animation: { __kuitoAnimation: { delay: number } } }
        >,
      ).map(([prop, track]) => [prop, track.animation.__kuitoAnimation.delay]),
    );

  assert.deepEqual(at(delay(80, fade)), { opacity: 80 });

  assert.deepEqual(at(stagger(50, fade, slide.up(12), zoom())), {
    opacity: 0,
    translateY: 50,
    scale: 100,
  });

  assert.deepEqual(
    at(sequence(fade, slide.up(12))),
    { opacity: 0, translateY: 200 },
    'the slide starts when the 200ms fade ends',
  );
});

test('keyframes of several values are an effect', () => {
  const pop = keyframes(
    { 0: { opacity: 0, scale: 0.8 }, 60: { scale: 1.1 }, 100: { opacity: 1, scale: 1 } },
    { duration: 500, easing: easing.linear },
  );
  const entering = data(resolveEffect(pop, 'enter', how, rest)) as Record<
    string,
    { from: number; animation: { __kuitoAnimation: { steps: Array<{ target: number }> } } }
  >;

  assert.equal(entering.scale.from, 0.8);

  assert.deepEqual(
    entering.scale.animation.__kuitoAnimation.steps.map((step) => step.target),
    [0.8, 1.1, 1],
  );

  assert.deepEqual(
    entering.opacity.animation.__kuitoAnimation.steps.map((step) => step.target),
    [0, 1],
    'a value the middle stop leaves out goes straight on',
  );
});

test('without a UI thread, an animated prop applies its target at once', () => {
  const { render, sent } = make();

  render({ opacity: 1 });
  render({ opacity: timing(200).to(0.5) });
  render({ opacity: sequence(timing().to(0.2), spring().to(0.8)) });

  assert.deepEqual(sent('opacity'), [
    ['opacity', 1],
    ['opacity', 0.5],
    ['opacity', 0.8],
  ]);
});

test('without a UI thread, enter, exit and layout apply at once', () => {
  const { render, sent, removed } = make();

  render({ opacity: 0.9, enter: fade, exit: fade, layout: spring({ damping: 20 }) });

  assert.deepEqual(sent('opacity'), [['opacity', 0.9]]);
  assert.deepEqual(sent('exit'), [], 'nothing holds the view');

  // Plain data, as its schema lays it out for the renderers: not JSON text.
  assert.deepEqual(data(sent('layout')[0]?.[1]), {
    type: 'spring',
    damping: 20,
    stiffness: 100,
    mass: 1,
    delay: 0,
  });

  render({}, false);
  assert.deepEqual(removed, ['card']);
});

test('compiled styles cross the boundary as plain data; their transition stays in the kernel', () => {
  const { host, render, calls } = make();
  const sheet = compileNativeCSS(
    '.card { background: linear-gradient(90deg, #a1c4fd, #c2e9fb); transition: opacity 200ms ease-out; }',
  );

  host.__kuito.installStyles(sheet.classes, sheet.rootFontSize);
  render({ class: 'card' });

  const value = (name: string) => calls.find(([, key]) => key === name)?.[2];

  assert.deepEqual(value('backgroundGradient'), {
    angle: 90,
    colors: ['#a1c4fd', '#c2e9fb'],
  });

  assert.deepEqual(
    calls.filter(([, key]) => key === 'transition' || key === 'transitions'),
    [],
  );
});

test('a prop animates with any animation; onEnd needs a motion value', () => {
  const { render } = make();

  assert.doesNotThrow(() => render({ opacity: repeat(timing().to(0), { count: 2 }) }));
  assert.doesNotThrow(() => render({ translateX: decay({ velocity: 300 }) }));

  assert.throws(
    () => render({ opacity: timing({ onEnd() {} }).to(1) }),
    /opacity: onEnd needs a motion value/,
  );

  assert.throws(() => render({ opacity: spring() }), /opacity: an animation needs a target/);
});

test('animate takes values, not animations, and no prop the view sets itself', () => {
  const { render } = make();

  assert.throws(
    () => render({ opacity: 1, animate: { opacity: 0 } }),
    /Native prop opacity on card is set by both opacity and animate/,
  );

  assert.throws(
    () => render({ animate: { opacity: timing().to(0) } }),
    /animate opacity takes a value; say how it moves in transition/,
  );

  assert.throws(
    () => render({ animate: { padding: 10 } }),
    /animate padding: padding does not animate/,
  );
});

/** The kernel with the UI-thread kernel behind it, as a device runs them. */
function linked() {
  const ui = installUIKernel();
  const native: PropCall[] = [];
  const removed: string[] = [];
  const host = installKernel(
    hosting({
      setProp(id: string, name: string, value: unknown) {
        native.push([id, name, value]);
      },
      removeView(id: string) {
        removed.push(id);
      },
      ui: (operations: unknown[]) => ui.ui.receive(structuredClone(operations)),
      uiScript() {},
      __kuitoHostMotionRead: (id: string) => ui.mirror.get(id),
    }),
  );
  const kuito = host.__kuito;
  let shown = true;
  let props: Props = {};
  const render = (next: Props, show = true) => {
    props = next;
    shown = show;

    kuito.patch('anim', (api) =>
      api.render(shown ? host.__kuitoJSX('Box', { id: 'card', ...props }) : null),
    );
  };
  const card = () => handleOf(kuito, 'card');
  /** What the UI thread set on `card`'s `name`, frame by frame. */
  const driven = (name: string) =>
    ui.props.filter(([id, key]) => id === card() && key === name).map(([, , value]) => value);
  /** Lets the kernel's operations reach the UI thread. */
  const delivered = () => Promise.resolve();
  /** Runs a display frame at `now`; what the UI thread then shows for `name`. */
  const frame = (now: number, name: string) => {
    ui.ui.frame(now);

    const values = driven(name);

    return values[values.length - 1];
  };

  return { host, kuito, ui, native, removed, render, driven, delivered, frame, card };
}

/** The value a time series ends on. */
const latest = <T>(values: T[]): T | undefined => values[values.length - 1];

const near = (actual: unknown, expected: number, what: string, epsilon = 0.02) =>
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) < epsilon,
    what + ': ' + String(actual) + ' is not about ' + expected,
  );

test('an animated prop runs on the UI thread, from the value it had', async () => {
  const { native, render, delivered, frame } = linked();

  render({ opacity: 1 });
  render({ opacity: timing({ duration: 200, easing: easing.linear }).to(0) });
  await delivered();

  near(frame(1000, 'opacity'), 1, 'it starts where the prop was');
  near(frame(1100, 'opacity'), 0.5, 'halfway');
  near(frame(1200, 'opacity'), 0, 'it ends at its target');

  assert.deepEqual(
    native.filter(([, key]) => key === 'opacity'),
    [['card', 'opacity', 1]],
    'only the plain value reaches the native view from the JS thread',
  );
});

test('animate with transition animates each change of a value; the first applies at once', async () => {
  const { native, render, delivered, frame } = linked();

  const transition = { opacity: timing({ duration: 200, easing: easing.linear }) };

  render({ animate: { opacity: 1 }, transition });
  render({ animate: { opacity: 0 }, transition });
  await delivered();

  frame(0, 'opacity');
  near(frame(100, 'opacity'), 0.5, 'halfway');
  near(frame(200, 'opacity'), 0, 'there');

  assert.deepEqual(
    native.filter(([, key]) => key === 'opacity' || key === 'animate'),
    [['card', 'opacity', 1]],
  );
});

test('animate without a transition springs transforms and fades the rest', async () => {
  const { render, delivered, frame } = linked();

  render({ animate: { opacity: 1, translateY: 0 } });
  render({ animate: { opacity: 0, translateY: 100 } });
  await delivered();

  frame(0, 'opacity');
  near(frame(300, 'opacity'), 0, 'a 300ms timing');

  const moved = [16, 100, 200, 300, 400, 500, 600].map((now) => Number(frame(now, 'translateY')));

  assert.ok(
    moved.some((value) => value > 100),
    'a default spring overshoots: ' + moved.join(', '),
  );
});

test('interrupting a spring keeps its velocity', async () => {
  const { render, delivered, frame } = linked();
  const transition = { transform: spring({ damping: 20, stiffness: 200 }) };

  render({ animate: { translateX: 0 }, transition });
  render({ animate: { translateX: 100 }, transition });
  await delivered();
  frame(0, 'translateX');

  const earlier = Number(frame(50, 'translateX'));
  const before = Number(frame(66, 'translateX'));
  const speed = before - earlier;

  render({ animate: { translateX: 300 }, transition });
  await delivered();

  const after = Number(frame(83, 'translateX')) - before;

  assert.ok(speed > 0, 'the first spring is moving');

  assert.ok(
    after > speed * 0.8,
    'the next frame keeps moving at about the same speed (' + speed + ' then ' + after + ')',
  );
});

test('a CSS transition animates a change of the props it names, colors too', async () => {
  const { host, native, render, delivered, frame } = linked();
  const sheet = compileNativeCSS(
    '.card { transition: opacity 200ms linear, background-color 200ms linear; }',
  );

  host.__kuito.installStyles(sheet.classes, sheet.rootFontSize);
  render({ class: 'card', opacity: 1, backgroundColor: '#000000' });
  render({ class: 'card', opacity: 0, backgroundColor: '#ffffff' });
  await delivered();

  frame(0, 'opacity');
  near(frame(100, 'opacity'), 0.5, 'the opacity is halfway');
  assert.equal(frame(100, 'backgroundColor'), '#808080', 'so is the color');
  assert.equal(frame(200, 'backgroundColor'), '#ffffff');

  assert.deepEqual(
    native.filter(([, key]) => key === 'opacity').map(([, , value]) => value),
    [1],
    'the first value applies at once; the change animates',
  );
});

test('corners, borders, shadows and sizes animate, each by its own transition', async () => {
  const { native, render, delivered, frame } = linked();
  const linear = timing({ duration: 200, easing: easing.linear });
  const transition = { borderRadius: linear, borderColor: linear, shadow: linear, width: linear };

  render({
    animate: { borderRadius: 0, borderColor: '#000000', shadowRadius: 2, width: 100, height: 40 },
    transition,
  });

  render({
    animate: { borderRadius: 12, borderColor: '#ffffff', shadowRadius: 10, width: 200, height: 80 },
    transition,
  });

  await delivered();

  frame(0, 'borderRadius');
  near(frame(100, 'borderRadius'), 6, 'the corners are halfway');
  assert.equal(frame(100, 'borderColor'), '#808080', 'so is the border color');
  near(frame(100, 'shadowRadius'), 6, 'and the shadow');
  near(frame(100, 'width'), 150, 'and the width');
  near(frame(300, 'height'), 80, 'height has no transition: a 300ms timing');

  assert.deepEqual(
    native.filter(([, key]) => key === 'width').map(([, , value]) => value),
    [100],
    'the first value applies at once; the change animates',
  );
});

test('a size that is not a number applies at once', async () => {
  const { native, render, delivered, driven } = linked();
  const transition = { width: timing(200) };

  render({ animate: { width: 100 }, transition });
  render({ animate: { width: '50%' }, transition });
  await delivered();

  assert.deepEqual(
    native.filter(([, key]) => key === 'width').map(([, , value]) => value),
    [100, '50%'],
  );

  assert.deepEqual(driven('width'), [], 'nothing runs on the UI thread');
});

test('a color keyframe animation moves through its stops', async () => {
  const { render, delivered, frame } = linked();

  render({ backgroundColor: '#000000' });

  render({
    backgroundColor: keyframes(
      { 0: '#000000', 50: '#ff0000', 100: '#0000ff' },
      { duration: 200, easing: easing.linear },
    ),
  });

  await delivered();

  frame(0, 'backgroundColor');
  assert.equal(frame(100, 'backgroundColor'), '#ff0000');
  assert.equal(frame(200, 'backgroundColor'), '#0000ff');
});

test('an animation that interrupts another starts where that one was', async () => {
  const { render, delivered, frame } = linked();
  const linear = { duration: 200, easing: easing.linear };

  render({ translateX: 0 });
  render({ translateX: timing(linear).to(100) });
  await delivered();
  frame(0, 'translateX');
  near(frame(100, 'translateX'), 50, 'the first animation got halfway');

  render({ translateX: timing(linear).to(0) });
  await delivered();
  near(frame(150, 'translateX'), 50, 'the second starts there, not at either end');
  near(frame(250, 'translateX'), 25, 'and is halfway back');
});

test('a plain value stops the animation and applies at once', async () => {
  const { ui, native, render, driven, delivered } = linked();

  render({ opacity: 1 });
  render({ opacity: spring().to(0) });
  await delivered();
  ui.ui.frame(0);
  ui.ui.frame(16);

  render({ opacity: 0.7 });
  await delivered();

  const before = driven('opacity').length;

  ui.ui.frame(32);

  assert.equal(driven('opacity').length, before, 'the UI thread no longer drives it');
  assert.deepEqual(latest(native), ['card', 'opacity', 0.7]);
});

test('a view enters from its effect to its own props on the UI thread', async () => {
  const { native, render, delivered, frame } = linked();

  render({
    opacity: 0.8,
    enter: fade.and(slide.up(12)),
    transition: { all: timing({ duration: 200, easing: easing.linear }) },
  });

  await delivered();

  near(frame(0, 'opacity'), 0, 'it starts transparent');
  near(frame(0, 'translateY'), 12, 'and 12 below');
  near(frame(100, 'opacity'), 0.4, 'halfway to its own opacity');
  near(frame(200, 'opacity'), 0.8, 'its own opacity');
  near(frame(200, 'translateY'), 0, 'in place');

  assert.deepEqual(
    native.filter(([, key]) => key === 'enter' || key === 'opacity'),
    [],
    'the UI thread sets the entering props',
  );
});

test('a view with exit stays until its exit ends on the UI thread', async () => {
  const { ui, native, removed, render, delivered, card } = linked();

  render({
    opacity: 0.8,
    exit: fade.and(slide.down(10)),
    transition: { all: timing({ duration: 200, easing: easing.linear }) },
  });

  await delivered();

  assert.deepEqual(
    native.filter(([, key]) => key === 'exit'),
    [['card', 'exit', true]],
    'the native view knows to wait for its exit',
  );

  const view = card();
  const shown = (prop: string) =>
    ui.props.filter(([id, key]) => id === view && key === prop).map(([, , value]) => value);

  render({}, false);
  await delivered();
  assert.deepEqual(removed, ['card'], 'it leaves the tree at once');

  ui.ui.frame(0);
  near(latest(shown('opacity')), 0.8, 'it leaves from where it was');
  ui.ui.frame(100);
  near(latest(shown('opacity')), 0.4, 'halfway');
  near(latest(shown('translateY')), 5, 'moving down');
  assert.deepEqual(shown('exited'), [], 'still on screen');

  ui.ui.frame(200);
  assert.deepEqual(shown('exited'), [true], 'then the native view may go');
  assert.equal(ui.ui.stats().motions, 0, 'and the UI thread keeps nothing of it');
});

test('reduce motion makes every animation jump to where it ends', async () => {
  const { kuito, render, delivered, frame } = linked();

  render({ opacity: 1, transition: { opacity: timing(1000) } });

  kuito.dispatch(
    0,
    'accessibility.status',
    JSON.stringify({ screenReaderEnabled: false, reduceMotionEnabled: true }),
  );

  render({ opacity: 0.2, transition: { opacity: timing(1000) } });
  await delivered();

  assert.equal(frame(0, 'opacity'), 0.2, 'no frames in between');
});

test('a removed view frees the motion values its props animated with', async () => {
  const { ui, render, delivered } = linked();

  render({ opacity: 1, scale: 1 });
  await delivered();

  const before = ui.ui.stats().motions;

  render({ opacity: timing().to(0), scale: spring().to(2) });
  await delivered();
  assert.equal(ui.ui.stats().motions, before + 2);

  render({}, false);
  await delivered();
  assert.equal(ui.ui.stats().motions, before);
});
