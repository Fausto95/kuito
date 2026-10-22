import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { easing, decay, repeat, spring, timing } from '../src/runtime/animation-specs.ts';
import { delay, sequence } from '../src/runtime/compose.ts';
import { installUIKernel, type UIHost } from './support/ui-host.ts';

/** The views these tests name, by the numbers the JS thread's kernel gives them. */
const views = { card: 1 };

// Animations as the JS-thread kernel sends them: plain data, onEnd as a
// JS-thread function the UI thread calls back.
const FRAME = 1000 / 60;

function animate(host: UIHost, id: string, animation: object, callback?: number) {
  const { onEnd: _onEnd, ...data } = animation as { onEnd?: unknown };

  host.send({
    op: 'motion',
    id,
    value: callback === undefined ? data : { ...data, onEnd: { $j: callback } },
  });
}

/** The value the JS thread would read, after each frame. */
const valueOf = (host: UIHost, id: string): number => {
  const mirrored = host.mirror.get(id);

  if (typeof mirrored !== 'object' || mirrored === null || !('value' in mirrored))
    throw new Error('No mirrored value for ' + id);

  return Number(mirrored.value);
};

/** Runs frames from `start` until `end` ms, collecting the value at each. */
function run(host: UIHost, id: string, start: number, end: number) {
  const values: Array<[number, number]> = [];

  for (let now = start; now <= end + 1e-9; now += FRAME) {
    host.ui.frame(now);
    values.push([now - start, valueOf(host, id)]);
  }

  return values;
}

function make(initial = 0) {
  const host = installUIKernel();

  host.send({ op: 'motion', id: 'm', value: initial });

  return host;
}

const close = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`,
  );

/** y for x on a cubic-bezier curve, by bisection: independent of the port. */
function bezier([x1, y1, x2, y2]: readonly number[], x: number): number {
  const at = (p1: number, p2: number, t: number) =>
    3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let low = 0;
  let high = 1;

  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;

    if (at(x1, x2, mid) < x) low = mid;
    else high = mid;
  }

  return at(y1, y2, (low + high) / 2);
}

test('timing follows its curve and ends exactly at its target', () => {
  const host = make();

  animate(host, 'm', timing({ duration: 200, easing: easing.inOut }).to(100), 1);

  assert.equal(host.requested.frames, 1, 'an animation asks for a frame');

  const values = run(host, 'm', 1000, 1250);

  values.forEach(([elapsed, value]) => {
    close(value, elapsed >= 200 ? 100 : 100 * bezier(easing.inOut, elapsed / 200), 1e-6);
  });

  assert.deepEqual(host.sent, [{ f: 1, args: [true] }], 'onEnd(true) once it ends');

  const frames = host.requested.frames;

  host.ui.frame(1300);
  assert.equal(host.requested.frames, frames, 'nothing animates: no more frames');
});

test("an underdamped spring is the oscillator's closed-form solution", () => {
  const host = make();

  animate(host, 'm', spring({ damping: 10, stiffness: 100, mass: 1 }).to(1));

  const zeta = 10 / (2 * Math.sqrt(100));
  const omega0 = 10;
  const omega1 = omega0 * Math.sqrt(1 - zeta * zeta);
  const expected = (seconds: number) =>
    1 -
    Math.exp(-zeta * omega0 * seconds) *
      (Math.cos(omega1 * seconds) + ((zeta * omega0) / omega1) * Math.sin(omega1 * seconds));

  run(host, 'm', 0, 500).forEach(([elapsed, value]) =>
    close(value, expected(elapsed / 1000), 1e-9),
  );

  run(host, 'm', 500 + FRAME, 4000);
  assert.equal(valueOf(host, 'm'), 1, 'it settles exactly on its target');
});

test('a spring described by duration settles in about that time', () => {
  const host = make();

  animate(host, 'm', spring({ duration: 500, dampingRatio: 1 }).to(1), 1);

  const values = run(host, 'm', 0, 1500);
  const settled = values.find(([, value]) => value === 1);

  assert.ok(settled, 'it settles');
  assert.ok(settled[0] > 300 && settled[0] < 1000, `settled at ${settled[0]}ms`);

  assert.ok(
    values.every(([, value]) => value <= 1 + 1e-9),
    'a damping ratio of 1 does not overshoot',
  );
});

test('a spring that interrupts a moving one keeps its velocity', () => {
  const fresh = make(50);
  const interrupted = make();

  animate(interrupted, 'm', spring().to(200));
  run(interrupted, 'm', 0, 100);

  const position = valueOf(interrupted, 'm');

  fresh.send({ op: 'motion', id: 'm', value: position });
  animate(fresh, 'm', spring().to(400));
  animate(interrupted, 'm', spring().to(400));
  fresh.ui.frame(0);
  fresh.ui.frame(FRAME);
  interrupted.ui.frame(100 + FRAME);
  interrupted.ui.frame(100 + 2 * FRAME);

  assert.ok(
    valueOf(interrupted, 'm') - position > valueOf(fresh, 'm') - position,
    'momentum carries into the new spring',
  );
});

test('decay slows down and stops at its clamp, or springs back from it', () => {
  const free = make();

  animate(free, 'm', decay({ velocity: 1000 }));

  const coasting = run(free, 'm', 0, 3000);

  // Reanimated's recurrence: each frame scales the last velocity by the decay
  // since the start, then moves by it; it stops below 1/20 units a second.
  let velocity = 1000;
  let position = 0;

  for (let now = FRAME; Math.abs(velocity) >= 1 / 20; now += FRAME) {
    velocity *= Math.exp(-(1 - 0.998) * now * 0.1);
    position += (velocity * FRAME) / 1000;
  }

  assert.ok(
    coasting.every(([, value], index) => index === 0 || value >= coasting[index - 1][1]),
    'it only moves forward',
  );

  close(coasting[coasting.length - 1][1], position, 1e-6);

  const clamped = make();

  animate(clamped, 'm', decay({ velocity: 1000, clamp: [0, 300] }), 1);
  run(clamped, 'm', 0, 2000);
  assert.equal(valueOf(clamped, 'm'), 300);
  assert.deepEqual(clamped.sent, [{ f: 1, args: [true] }]);

  const rubber = make();

  animate(rubber, 'm', decay({ velocity: 1000, clamp: [0, 300], rubberBand: true }));

  const bounced = run(rubber, 'm', 0, 5000);

  assert.ok(Math.max(...bounced.map(([, value]) => value)) > 300, 'it overshoots the clamp');
  assert.equal(valueOf(rubber, 'm'), 300, 'then rests on it');
});

test('a sequence runs its steps in order, ending each one', () => {
  const host = make();
  const linear = { duration: 100, easing: easing.linear };

  animate(host, 'm', sequence(timing(linear).to(1), timing(linear).to(0)));

  const values = run(host, 'm', 0, 250);

  close(values.find(([elapsed]) => Math.abs(elapsed - 50) < FRAME / 2)?.[1] ?? NaN, 0.5, 0.11);
  assert.ok(Math.max(...values.map(([, value]) => value)) === 1, 'it reaches the first target');
  assert.equal(valueOf(host, 'm'), 0, 'and ends at the last');
});

test('repeat reverses each time, and runs forever with no count', () => {
  const host = make();

  animate(
    host,
    'm',
    repeat(timing({ duration: 100, easing: easing.linear }).to(1), { count: 2, reverse: true }),
    1,
  );

  run(host, 'm', 0, 120);
  assert.ok(valueOf(host, 'm') < 1, 'it is on its way back');
  run(host, 'm', 120 + FRAME, 400);
  assert.equal(valueOf(host, 'm'), 0);
  assert.deepEqual(host.sent, [{ f: 1, args: [true] }]);

  const laps = make();

  animate(
    laps,
    'm',
    repeat({ ...timing({ duration: 100 }).to(1), onEnd: { $j: 2 } } as never, { count: 3 }),
  );

  run(laps, 'm', 0, 400);

  assert.deepEqual(
    laps.sent,
    [true, true, true].map((finished) => ({ f: 2, args: [finished] })),
    "the repeated animation's onEnd runs every repetition",
  );

  const forever = make();

  animate(
    forever,
    'm',
    repeat(timing({ duration: 100 }).to(1), { count: Infinity, reverse: true }),
  );

  const frames = forever.requested.frames;

  run(forever, 'm', 0, 5000);
  assert.ok(forever.requested.frames > frames + 200, 'it keeps asking for frames');
});

test('during a delay, the animation it interrupts keeps running', () => {
  const host = make();
  const linear = { duration: 400, easing: easing.linear };

  animate(host, 'm', timing(linear).to(400));
  run(host, 'm', 0, 100);

  const before = valueOf(host, 'm');

  animate(host, 'm', delay(200, timing(linear).to(0)));
  run(host, 'm', 100 + FRAME, 250);
  assert.ok(valueOf(host, 'm') > before, 'the first one still moves');
  run(host, 'm', 250 + FRAME, 1200);
  assert.equal(valueOf(host, 'm'), 0);
});

test('a new value interrupts an animation, which ends unfinished', () => {
  const host = make();

  animate(host, 'm', timing({ duration: 1000 }).to(100), 1);
  run(host, 'm', 0, 100);
  host.send({ op: 'motion', id: 'm', value: 7 });

  assert.equal(valueOf(host, 'm'), 7);
  assert.deepEqual(host.sent, [{ f: 1, args: [false] }]);
});

test('bindings follow an animating value every frame', () => {
  const host = make();

  host.send({ op: 'bind', view: views.card, prop: 'translateY', source: { $m: 'm' } });
  animate(host, 'm', timing({ duration: 100, easing: easing.linear }).to(100));
  run(host, 'm', 0, 100);

  const written = host.props.filter(([view]) => view === views.card).map(([, , value]) => value);

  assert.ok(written.length >= 6, 'one write per frame');
  assert.equal(written[written.length - 1], 100);
});

test('only numbers and colors animate; anything else is reported', () => {
  const host = make();

  host.send({ op: 'motion', id: 'label', value: 'idle' });
  animate(host, 'label', timing().to(1));
  host.ui.frame(0);

  assert.match(
    host.logs.map(([, message]) => message).join('\n'),
    /motion value label: only numbers and colors animate/,
  );
});

test('a color animates channel by channel toward a hex color', () => {
  const host = make();
  const color = () => {
    const mirrored = host.mirror.get('tint');

    return typeof mirrored === 'object' && mirrored !== null && 'value' in mirrored
      ? mirrored.value
      : undefined;
  };

  host.send({ op: 'motion', id: 'tint', value: '#000000' });
  animate(host, 'tint', timing({ duration: 100, easing: easing.linear }).to('#ff8000'));
  host.ui.frame(0);
  host.ui.frame(50);
  assert.equal(color(), '#804000');

  host.ui.frame(100);
  assert.equal(color(), '#ff8000');
});
