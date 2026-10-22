import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'rolldown/experimental';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { compileSource } from '../src/dev/transform.ts';

// The thread pass runs after the component pass, on the same parse, as in the bundler.
const compile = (source: string, filename = 'app.tsx') => compileSource(source, filename);

type Factory = (captures: unknown[]) => (...args: unknown[]) => unknown;

/** The UI bundle's functions by id, as the UI runtime registers them. */
function uiFunctions(ui: string): Map<string, Factory> {
  const defined = new Map<string, Factory>();

  runInNewContext(ui, {
    __kuitoUI: { define: (id: string, factory: Factory) => defined.set(id, factory) },
    console: { log() {} },
  });

  return defined;
}

interface Tagged {
  fn: unknown;
  id: string;
  captures: () => unknown[];
}

/** Runs the JS-thread output with `__kuitoThread` recording each tagged function. */
function runJs(code: string, globals: Record<string, unknown> = {}) {
  const tagged: Tagged[] = [];
  const js = transformSync('app.ts', code, { lang: 'ts' });

  assert.equal(js.errors.length, 0, js.errors[0]?.message);

  const exports: Record<string, unknown> = {};

  runInNewContext(js.code.replaceAll(/\bexport /g, ''), {
    ...globals,
    exports,
    __kuitoThread(fn: unknown, id: string, captures: () => unknown[]) {
      tagged.push({ fn, id, captures });

      return fn;
    },
  });

  return tagged;
}

const capturesOf = (result: ReturnType<typeof compile>, name: string) =>
  result.functions.find((fn) => fn.name === name)?.captures;

test('a module function gets a UI copy that reads its captures', () => {
  const source = `
    const offset = motion(0);
    const theme = { dim: 0.5, title: 'Reel' };
    export function fade() { return theme.dim * offset.value; }
  `;
  const result = compile(source, 'fade.ts');
  const [fade] = result.functions;

  assert.equal(fade.name, 'fade');

  assert.deepEqual(fade.captures, [
    { path: 'theme.dim', uses: ['read'] },
    { path: 'offset', uses: ['read'] },
  ]);

  const [tagged] = runJs(result.code, { motion: (value: number) => ({ value }) });

  assert.equal(tagged.id, fade.id);
  assert.deepEqual(JSON.parse(JSON.stringify(tagged.captures())), [0.5, { value: 0 }]);

  const ui = uiFunctions(result.ui).get(fade.id);

  assert.ok(ui, 'fade is in the UI bundle');
  assert.equal(ui([0.5, { value: 0.8 }])(), 0.4);
});

test('a module function is tagged before code that calls it ahead of its declaration', () => {
  const result = compile(
    `
    export const first = half(8);
    export function half(x: number): number { return x / 2; }
    export function outer() {
      return inner();
      function inner() { return 1; }
    }
  `,
    'hoist.ts',
  );
  const tagged = runJs(result.code);
  const run = (name: string, ...args: number[]) => {
    const id = result.functions.find((fn) => fn.name === name)?.id;
    const fn = tagged.find((item) => item.id === id)?.fn;

    assert.ok(typeof fn === 'function', `${name} is tagged`);

    return fn(...args);
  };

  assert.equal(run('half', 8), 4);
  assert.equal(run('outer'), 1);

  assert.match(result.code, /\/\* @__PURE__ \*\/ __kuitoThread\(function half\(/);
});

test('an overloaded module function is tagged once, by its implementation', () => {
  const result = compile(
    `
    export function same(a: number): number;
    export function same(a: string): string;
    export function same(a: unknown) { return a; }
    function twice(a: number): number;
    function twice(a: string): string;
    function twice(a: number | string) { return typeof a === 'number' ? a * 2 : a + a; }
    export const both = [same(1), twice('a')];
  `,
    'overloads.ts',
  );

  assert.deepEqual(
    result.functions.map((fn) => fn.name),
    ['same', 'twice'],
  );

  const tagged = runJs(result.code);
  const run = (name: string, arg: unknown) => {
    const id = result.functions.find((fn) => fn.name === name)?.id;
    const fn = tagged.find((item) => item.id === id)?.fn;

    assert.ok(typeof fn === 'function', `${name} is tagged`);

    return fn(arg);
  };

  assert.equal(run('same', 'x'), 'x');
  assert.equal(run('twice', 4), 8);
});

test('an overloaded default export compiles', () => {
  const result = compile(
    `
    export default function pick(a: number): number;
    export default function pick(a: string): string;
    export default function pick(a: unknown) { return a; }
  `,
    'pick.ts',
  );

  assert.deepEqual(transformSync('pick.ts', result.code, { lang: 'ts' }).errors, []);
});

test('a JSX prop expression is compiled for both threads', () => {
  const result = compile(`
    export function Card() {
      const offset = motion(0);
      return <Box opacity={1 - offset.value / 200} />;
    }
  `);
  const expression = result.functions.find((fn) => fn.kind === 'expression');

  assert.ok(expression);
  assert.deepEqual(expression.captures, [{ path: 'offset', uses: ['read'] }]);

  assert.match(
    result.code,
    /__kuitoExpr\("[a-f0-9]{16}", \/\* @__PURE__ \*\/ __kuitoThread\(\(\) => \(1 - offset\.value \/ 200\), "tf_[a-z0-9]+", \(\) => \[offset\], \[\["offset","read"\]\]\)\)/,
  );

  assert.equal(uiFunctions(result.ui).get(expression.id)?.([{ value: 100 }])(), 0.5);
});

test('captures stop at .value and otherwise keep the narrowest member path', () => {
  const result = compile(`
    export function Card(props) {
      const offset = motion(0);
      return <Box opacity={props.dim ? offset.value : props.style.opacity} />;
    }
  `);
  const expression = result.functions.find((fn) => fn.kind === 'expression');

  assert.deepEqual(expression?.captures, [
    { path: 'props.dim', uses: ['read'] },
    { path: 'offset', uses: ['read'] },
    { path: 'props.style.opacity', uses: ['read'] },
  ]);
});

test('an event handler records writes and fire-and-forget calls', () => {
  const result = compile(`
    export function Feed() {
      const offset = motion(0);
      const label = signal('');
      return <Scroll onScroll={(event) => {
        offset.value = event.contentOffset.y;
        label.value = 'scrolled';
        track('scroll', event.contentOffset.y);
      }} />;
    }
  `);
  const handler = result.functions.find((fn) => fn.kind === 'handler');

  assert.deepEqual(handler?.captures, [
    { path: 'offset', uses: ['write'] },
    { path: 'label', uses: ['write'] },
    { path: 'track', uses: ['call'] },
  ]);
});

test('a call whose result is used needs a UI function', () => {
  const result = compile(`
    function half(x: number): number { return x / 2; }
    export function Card() {
      const offset = motion(0);
      return <Box opacity={half(offset.value)} />;
    }
  `);
  const expression = result.functions.find((fn) => fn.kind === 'expression');

  assert.deepEqual(expression?.captures, [
    { path: 'half', uses: ['callResult'] },
    { path: 'offset', uses: ['read'] },
  ]);

  assert.deepEqual(capturesOf(result, 'half'), []);

  const half = result.functions.find((fn) => fn.name === 'half');

  assert.equal(uiFunctions(result.ui).get(half?.id ?? '')?.([])(8), 4);
});

test('locals, parameters, shadowed names and globals are not captured', () => {
  const result = compile(
    `
    const offset = motion(0);
    export function clampAll(values: number[], offset: number) {
      const limit = Math.max(1, offset);
      let total = 0;
      for (const value of values) total += Math.min(value, limit);
      const twice = (n) => n * 2;
      console.log(JSON.stringify({ total, offset }));
      return twice(total) + Number.EPSILON;
    }
  `,
    'clamp.ts',
  );

  assert.deepEqual(capturesOf(result, 'clampAll'), []);

  assert.equal(
    uiFunctions(result.ui).get(result.functions[0].id)?.([])([1, 5], 2),
    6 + Number.EPSILON,
  );
});

test('TypeScript is stripped from the UI bundle', () => {
  const result = compile(
    `
    interface Point { x: number }
    export function x(point: Point): number { return (point as Point).x!; }
  `,
    'point.ts',
  );

  assert.doesNotMatch(result.ui, /as Point|: number|interface/);
  assert.equal(uiFunctions(result.ui).get(result.functions[0].id)?.([])({ x: 3 }), 3);
});

test('functions that cannot run on the UI thread are rejected with a reason', () => {
  const result = compile(
    `
    let count = 0;
    export function bump() { count = count + 1; }
    export function self() { return this; }
    export async function load() { await fetch('/'); }
    export function view() { return <Box />; }
    export function args() { return arguments.length; }
    export function make() { return new Thing(); }
  `,
    'reject.tsx',
  );
  const reasons = Object.fromEntries(result.rejected.map((fn) => [fn.name, fn.reason]));

  assert.deepEqual(reasons, {
    bump: 'assigns count, a JS-thread variable',
    self: 'uses this',
    load: 'is async',
    view: 'creates JSX',
    args: 'uses arguments',
    make: 'constructs Thing',
  });

  assert.equal(result.functions.length, 0);

  assert.doesNotMatch(
    result.code,
    /__kuitoThreadRejected\(function view/,
    'components are not tagged',
  );

  assert.match(
    result.code,
    /var bump = \/\* @__PURE__ \*\/ __kuitoThreadRejected\(function bump\(\) \{ count = count \+ 1; \}, "assigns count, a JS-thread variable \(reject\.tsx:3:12\)"\)/,
  );
});

test('ids are stable for unchanged code and differ between functions', () => {
  const source = 'export function a() { return 1; }\nexport function b() { return 2; }';
  const first = compile(source, 'ids.ts');
  const second = compile(source, 'ids.ts');

  assert.deepEqual(
    first.functions.map((fn) => fn.id),
    second.functions.map((fn) => fn.id),
  );

  assert.notEqual(first.functions[0].id, first.functions[1].id);
});

test('an id follows what a function does, not where it is or how it is laid out', () => {
  const ids = (source: string) =>
    Object.fromEntries(compile(source, 'ids.ts').functions.map((fn) => [fn.name, fn.id]));
  const before = ids('export function a() { return 1; }\nexport function b() { return 2; }');

  assert.deepEqual(
    ids(
      '// b moved up\n\nexport function b() {\n  return (2);\n}\n\nexport function a() { return 1; /* same */ }',
    ),
    before,
    'moved, reformatted and commented',
  );

  const edited = ids('export function a() { return 3; }\nexport function b() { return 2; }');

  assert.notEqual(edited.a, before.a, 'an edited function gets a new id');
  assert.equal(edited.b, before.b, 'the others keep theirs');
});

test('a capture read through ?. stays optional, so an absent object is not a throw', () => {
  const result = compile(
    `
    const theme: { colors?: { dim: number } } = {};
    export function dim() { return theme.colors?.dim ?? 1; }
  `,
    'dim.ts',
  );
  const [fn] = result.functions;

  assert.deepEqual(fn.captures, [{ path: 'theme.colors.dim', uses: ['read'] }]);

  const [tagged] = runJs(result.code);

  assert.deepEqual([...tagged.captures()], [undefined]);
  assert.equal(uiFunctions(result.ui).get(fn.id)?.([undefined])(), 1);
});

test('typeof on a name nothing declares keeps the function on the JS thread', () => {
  const result = compile(
    `
    const maybe = undefined;
    export function web() { return typeof document !== 'undefined'; }
    export function known() { return typeof maybe; }
  `,
    'web.ts',
  );

  assert.deepEqual(
    result.rejected.map(({ name, reason }) => [name, reason]),
    [['web', 'reads typeof document, which nothing declares']],
  );

  assert.match(result.code, /"reads typeof document, which nothing declares \(web\.ts:3:12\)"/);
  assert.deepEqual(capturesOf(result, 'known'), [{ path: 'maybe', uses: ['read'] }]);
});

test('using the result of a function from a package keeps the caller on the JS thread', () => {
  const result = compile(
    `
    import { clamp } from 'lodash-es';
    import * as analytics from 'analytics';
    import { half } from './half';
    export function fit(x: number) { return clamp(x, 0, 1); }
    export function score(x: number) { return analytics.score(x); }
    export function track(x: number) { analytics.track(x); }
    export function own(x: number) { return half(x); }
  `,
    'fit.ts',
  );

  assert.deepEqual(
    result.rejected.map(({ name, reason }) => [name, reason]),
    [
      ['fit', 'uses the result of clamp, a JS-thread function from lodash-es'],
      ['score', 'uses the result of analytics.score, a JS-thread function from analytics'],
    ],
  );

  assert.match(result.code, /from lodash-es \(fit\.ts:5:12\)"/);
  // A namespace's member is a binding of its own, captured alone.
  assert.deepEqual(capturesOf(result, 'track'), [{ path: 'analytics.track', uses: ['call'] }]);
  assert.deepEqual(capturesOf(result, 'own'), [{ path: 'half', uses: ['callResult'] }]);
});

test('the UI bundle runs as a script: object spread and rest need no helper modules', () => {
  const result = compile(
    `
    export function merge(style: object, extra: { a: number; b: number }) {
      const { a, ...rest } = extra;
      return { ...style, ...rest, a: a * 2 };
    }
  `,
    'merge.ts',
  );

  assert.doesNotMatch(result.ui, /require\(|import /);

  const merged = uiFunctions(result.ui).get(result.functions[0].id)?.([])({ x: 1 }, { a: 2, b: 3 });

  // From the UI context's realm: compare the data.
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), { x: 1, b: 3, a: 4 });
});

test('callbacks given to on* properties get UI copies, as gestures and animations take them', () => {
  const result = compile(
    `
    export function Card() {
      const x = motion(0);
      const drag = pan({ onChange: (event) => { x.value += event.changeX; } });
      const settle = () => { x.value = timing({ onEnd: (finished) => { done.value = finished; } }).to(0); };
      const labels = items.map((item) => item.label);
      return <Box gestures={[drag]} />;
    }
  `,
    'card.tsx',
  );
  const callbacks = result.functions.filter((fn) => fn.kind === 'callback').map((fn) => fn.name);

  assert.deepEqual(callbacks, ['onChange', 'onEnd']);
  assert.match(result.code, /onChange: \/\* @__PURE__ \*\/ __kuitoThread\(\(event\) =>/);
  assert.doesNotMatch(result.code, /items\.map\(__kuitoThread/, 'other callbacks stay plain');
});

test('a function given to a motion value’s map gets a UI copy; an array’s map does not', () => {
  const result = compile(
    `
    export function Card() {
      const drag = pan();
      const x = motion(0).follows(drag.x);
      const tilt = x.map((v) => v / 20);
      const labels = items.map((item) => item.label);
      return <Box rotate={tilt} opacity={clamp(x, 0, 1).map((v) => 1 - v)} />;
    }
  `,
    'card.tsx',
  );
  const maps = result.functions.filter((fn) => fn.kind === 'callback' && fn.name === 'map');

  assert.equal(maps.length, 2);
  assert.match(result.code, /x\.map\(\/\* @__PURE__ \*\/ __kuitoThread\(\(v\) =>/);
  assert.doesNotMatch(result.code, /items\.map\(\/\* @__PURE__ \*\/ __kuitoThread/);
});

test('a function given to a motion source’s field’s map gets a UI copy, destructured or not', () => {
  const result = compile(
    `
    export function Feed() {
      const feed = scrollMotion();
      const { velocity } = scrollMotion();
      return [
        <Box translateY={feed.offset.map((offset) => offset / 2)} />,
        <Box opacity={velocity.map((speed) => 1 - speed / 1000)} />,
        <Box scale={feed.other.map((value) => value)} />,
      ];
    }
  `,
    'feed.tsx',
  );

  assert.match(result.code, /feed\.offset\.map\(\/\* @__PURE__ \*\/ __kuitoThread\(\(offset\) =>/);
  assert.match(result.code, /velocity\.map\(\/\* @__PURE__ \*\/ __kuitoThread\(\(speed\) =>/);
  assert.doesNotMatch(result.code, /other\.map\(\/\* @__PURE__ \*\/ __kuitoThread/, 'not a field');
});

test('a function given to keyboard.height’s map gets a UI copy', () => {
  const result = compileSource(
    `
    import { Box, keyboard } from 'kuito';
    export function Bar() {
      return <Box translateY={keyboard.height.map((height) => -height)} />;
    }
  `,
    '/app/bar.tsx',
  );

  assert.match(
    result.code,
    /keyboard\.height\.map\(\/\* @__PURE__ \*\/ __kuitoThread\(\(height\) =>/,
  );
});

test("a namespace's member is captured alone; an object's method keeps its receiver", () => {
  const result = compileSource(
    `
    import { haptics, keepAwake } from 'kuito';
    import battery from './modules/battery/battery';
    import { store } from './store';
    export function buzz() { haptics.selection(); }
    export function level() { return battery.level(); }
    export function save() { store.save(); }
    export function awake() { keepAwake(); }
  `,
    '/app/app.tsx',
    { isSpec: (path) => path === '/app/modules/battery/battery.ts' },
  );

  assert.deepEqual(capturesOf(result, 'buzz'), [{ path: 'haptics.selection', uses: ['call'] }]);
  assert.deepEqual(capturesOf(result, 'level'), [{ path: 'battery.level', uses: ['callResult'] }]);
  assert.deepEqual(capturesOf(result, 'save'), [{ path: 'store', uses: ['call'] }]);
  assert.deepEqual(capturesOf(result, 'awake'), [{ path: 'keepAwake', uses: ['call'] }]);
});

test('the placement report names what reads a motion value, where it runs and why', () => {
  const result = compile(
    `
    class Thing {}
    export function Card() {
      const x = motion(0);
      const count = signal(0);
      const drag = pan({ onChange: (event) => { x.value += event.changeX; } });
      return (
        <Box
          translateX={x}
          rotate={x.map((v) => v / 20)}
          width={new Thing(x.value)}
          opacity={count.value}
          onPress={() => { x.value = 1; }}
          onLongPress={() => { count.value++; }}
          gestures={[drag, tap({ onEnd: () => { x.value = new Thing(); } }), tap({ onEnd: () => <Text /> })]}
        />
      );
    }
  `,
    'card.tsx',
  );

  assert.deepEqual(
    result.placement.map(({ site, reason }) => (reason ? `${site}: ${reason}` : site)),
    [
      'pan onChange',
      'Box translateX',
      'Box rotate',
      'Box width: constructs Thing',
      'Box onPress',
      'tap onEnd: constructs Thing',
    ],
  );

  const width = result.placement.find(({ site }) => site === 'Box width');

  assert.deepEqual(width && [width.line, width.column], [11, 18]);
});

const placed = (result: ReturnType<typeof compile>) =>
  result.placement.map(({ site, reason }) => (reason ? `${site}: ${reason}` : site));

test('a component whose signals only placeable props and handlers read is placed whole', () => {
  const result = compile(
    `
    import { Pressable, Text, signal } from 'kuito';
    export function Toggle() {
      const on = signal(false);
      const taps = signal(0);
      return (
        <Pressable
          opacity={on.value ? 1 : 0.5}
          onPress={() => {
            on.value = !on.value;
            taps.value++;
          }}
        >
          <Text>{taps.value} taps</Text>
        </Pressable>
      );
    }
  `,
    'toggle.tsx',
  );

  assert.match(result.code, /const on = globalThis\.__kuito\.useMotion\(false, "on"\)/);
  assert.match(result.code, /const taps = globalThis\.__kuito\.useMotion\(0, "taps"\)/);

  assert.deepEqual(placed(result), [
    'component Toggle',
    'Pressable opacity',
    'Pressable onPress',
    'Text children',
  ]);
});

test('a signal the JS thread has to read keeps its component there, unreported', () => {
  const cases = {
    'a child that renders JSX': `<Box>{open.value ? <Text>open</Text> : null}</Box>`,
    'a prop of a component': `<Card open={open.value} />`,
    'the signal itself': `<Toggle value={open} />`,
    'a class': `<Box class={open.value ? 'open' : 'shut'} />`,
    'a handler that reads a JS-thread value': `<Pressable label="Open" opacity={open.value ? 1 : 0} onPress={() => { open.value = props.shown.value; }} />`,
  };

  for (const [what, jsx] of Object.entries(cases)) {
    const result = compile(
      `
      import { Box, Pressable, Text, Toggle, signal } from 'kuito';
      export function Panel(props) {
        const open = signal(false);
        return ${jsx};
      }
    `,
      'panel.tsx',
    );

    assert.match(result.code, /const open = signal\(false, "open"\)/, what);

    assert.deepEqual(
      placed(result).filter((site) => site.startsWith('component')),
      [],
      what,
    );
  }
});

test('a signal outside a component, or not made from a literal, stays a signal', () => {
  const result = compile(
    `
    import { Box, signal } from 'kuito';
    const shared = signal(0);
    export function Counter(props) {
      const start = signal(props.start);
      return <Box opacity={shared.value + start.value} />;
    }
  `,
    'counter.tsx',
  );

  assert.doesNotMatch(result.code, /useMotion/);
});

test('a placeable component held back by code the compiler rejected is a fallback, with why', () => {
  const result = compile(
    `
    import { Pressable, signal } from 'kuito';
    class Ripple {}
    export function Toggle() {
      const on = signal(false);
      return <Pressable label="Toggle" opacity={on.value ? 1 : 0.5} onPress={() => { on.value = !on.value; new Ripple(); }} />;
    }
  `,
    'toggle.tsx',
  );

  assert.match(result.code, /const on = signal\(false, "on"\)/);

  assert.deepEqual(
    placed(result).filter((site) => site.startsWith('component')),
    ['component Toggle: has signal on read by Pressable onPress, which constructs Ripple'],
  );
});

test('a local function only handlers use counts as a handler', () => {
  const result = compile(
    `
    import { Pressable, Text, motion, signal, spring, timing } from 'kuito';
    export function Spinner() {
      const turn = motion(0);
      const spinning = signal(false);
      const spins = signal(0);
      const spin = () => {
        if (spinning.value) {
          turn.value = spring().to(0);
          spinning.value = false;

          return;
        }

        spinning.value = true;
        turn.value = timing({ onEnd: (finished) => finished && spins.value++ }).to(360);
      };

      return (
        <Pressable label="Spin" rotate={turn} onPress={spin} onLongPress={() => spin()}>
          <Text>{spinning.value ? spins.value + ' spins' : 'Spin'}</Text>
        </Pressable>
      );
    }
  `,
    'spinner.tsx',
  );

  assert.match(result.code, /const spinning = globalThis\.__kuito\.useMotion\(false, "spinning"\)/);

  assert.ok(placed(result).includes('component Spinner'));
});

test('a computed of placed signals and motion values is placed with its component', () => {
  const result = compile(
    `
    import { Pressable, Text, computed, motion, signal } from 'kuito';
    export function Counter() {
      const count = signal(0);
      const lift = motion(0);
      const doubled = computed(() => count.value * 2);
      const shown = computed(() => doubled.value + lift.value);
      return (
        <Pressable label="Add" opacity={shown.value / 10} onPress={() => count.value++}>
          <Text>{doubled.value}</Text>
        </Pressable>
      );
    }
  `,
    'counter.tsx',
  );

  assert.match(result.code, /const count = globalThis\.__kuito\.useMotion\(0, "count"\)/);
  assert.match(result.code, /const doubled = globalThis\.__kuito\.derive\(/);
  assert.match(result.code, /const shown = globalThis\.__kuito\.derive\(/);

  assert.deepEqual(placed(result), [
    'component Counter',
    'computed doubled',
    'computed shown',
    'Pressable opacity',
    'Pressable onPress',
    'Text children',
  ]);

  const doubled = result.placement.find(({ site }) => site === 'computed doubled');

  assert.deepEqual(doubled && [doubled.line, doubled.column], [6, 23]);
});

test('a computed of motion values alone is placed', () => {
  const result = compile(
    `
    import { Box, computed, motion } from 'kuito';
    export function Fade() {
      const progress = motion(0);
      const opacity = computed(() => Math.min(1, progress.value * 2));
      return <Box opacity={opacity.value} />;
    }
  `,
    'fade.tsx',
  );

  assert.match(result.code, /const opacity = globalThis\.__kuito\.derive\(/);
  assert.deepEqual(placed(result), ['component Fade', 'computed opacity', 'Box opacity']);
});

test('a placeable computed that reads a JS-thread value is a fallback, where it is', () => {
  const cases = {
    'a JS-thread signal': [
      'count.value + props.step.value',
      'reads props.step.value, which only the JS thread has',
    ],
    'a computed that stays on the JS thread': [
      'count.value + label.value.length',
      'reads label.value, which only the JS thread has',
    ],
    'a write': ['(count.value = 1)', 'writes count.value'],
    'a call for its effect': [
      '{ console.log(count.value); return count.value; }',
      'calls console.log for its effect',
    ],
  };

  for (const [what, [body, reason]] of Object.entries(cases)) {
    const result = compile(
      `
      import { Box, computed, signal } from 'kuito';
      export function Panel(props) {
        const count = signal(0);
        const label = computed(() => props.title.value);
        const total = computed(() => ${body});
        return <Box opacity={total.value} onPress={() => count.value++} />;
      }
    `,
      'panel.tsx',
    );

    assert.match(result.code, /const count = signal\(0, "count"\)/, what);
    assert.match(result.code, /const total = computed\(/, what);

    assert.deepEqual(
      result.placement
        .filter(({ site }) => site.startsWith('component') || site.startsWith('computed'))
        .map(({ site, reason: why, line, column }) => [site, why, line, column]),
      [['computed total', reason, 6, 23]],
      what,
    );
  }
});

test('a computed of JS-thread values alone stays a computed, unreported', () => {
  const result = compile(
    `
    import { Box, computed, signal } from 'kuito';
    export function Panel(props) {
      const open = signal(false);
      const title = computed(() => props.title.value.toUpperCase());
      return <Box opacity={open.value ? 1 : 0} label={title.value} onPress={() => (open.value = !open.value)} />;
    }
  `,
    'panel.tsx',
  );

  assert.match(result.code, /const title = computed\(/);
  assert.doesNotMatch(result.code, /__kuito\.derive/);

  assert.deepEqual(
    placed(result).filter((site) => site.startsWith('computed')),
    [],
  );
});

test('a computed the JS thread has to read keeps its component there, unreported', () => {
  const result = compile(
    `
    import { Box, Text, computed, signal } from 'kuito';
    export function Panel() {
      const count = signal(0);
      const many = computed(() => count.value > 3);
      return <Box onPress={() => count.value++}>{many.value ? <Text>many</Text> : null}</Box>;
    }
  `,
    'panel.tsx',
  );

  assert.match(result.code, /const many = computed\(/);
  assert.match(result.code, /const count = signal\(0, "count"\)/);

  assert.deepEqual(
    placed(result).filter((site) => site.startsWith('component') || site.startsWith('computed')),
    [],
  );
});

test("a computed's own data is not a JS-thread value", () => {
  const result = compile(
    `
    import { Box, computed, signal } from 'kuito';
    const options = [{ value: 1, opacity: 0.5 }];
    export function Picker() {
      const selected = signal(1);
      const opacity = computed(() => options.find((option) => option.value === selected.value)?.opacity);
      return <Box opacity={opacity.value} onPress={() => (selected.value = 2)} />;
    }
  `,
    'picker.tsx',
  );

  assert.match(result.code, /const opacity = globalThis\.__kuito\.derive\(/);
  assert.ok(placed(result).includes('computed opacity'));
});

test('a computed that calls for an effect inside an expression is a fallback', () => {
  const result = compile(
    `
    import { Box, computed, signal } from 'kuito';
    const seen = [];
    export function Panel() {
      const count = signal(0);
      const total = computed(() => (seen.push(count.value), count.value));
      return <Box opacity={total.value} onPress={() => count.value++} />;
    }
  `,
    'panel.tsx',
  );

  assert.deepEqual(
    placed(result).filter((site) => site.startsWith('computed')),
    ['computed total: calls seen.push for its effect'],
  );
});

test("a local function named computed is not Kuito's", () => {
  const result = compile(
    `
    import { Box, computed, signal } from 'kuito';
    export function Panel() {
      const computed = (fn) => ({ get value() { return fn(); } });
      const count = signal(0);
      const doubled = computed(() => count.value * 2);
      return <Box opacity={doubled.value} onPress={() => count.value++} />;
    }
  `,
    'panel.tsx',
  );

  assert.doesNotMatch(result.code, /__kuito\.derive/);
});

test("a field's format gets a UI copy and is reported where it runs, as a map is", () => {
  const result = compile(
    `
    import { TextField, signal } from 'kuito';
    import { clamp } from 'lodash-es';
    class Grouping {}
    export function Payment() {
      const card = signal('');
      return (
        <>
          <TextField value={card} format={(text) => text.replace(/\\D/g, '')} />
          <TextField format={(text) => new Grouping(text).toString()} />
          <TextField format={(text) => String(clamp(text.length, 0, 4))} />
        </>
      );
    }
  `,
    'payment.tsx',
  );

  assert.deepEqual(
    result.functions.filter((fn) => fn.kind === 'handler').map((fn) => fn.name),
    ['format'],
  );

  assert.deepEqual(placed(result), [
    'TextField format',
    'TextField format: constructs Grouping',
    'TextField format: uses the result of clamp, a JS-thread function from lodash-es',
  ]);
});

test('a module’s UI copy maps back to the lines it was written on', () => {
  const source = [
    "import { motion } from 'kuito';",
    'const offset = motion(0);',
    '',
    'export function fade(scale: number) {',
    '  return offset.value * scale;',
    '}',
  ].join('\n');
  const result = compile(source, '/app/fade.tsx');

  assert.ok(result.uiMap, 'the UI copy has a map');

  const map = new TraceMap(result.uiMap);
  const lines = result.ui.split('\n');
  const line = lines.findIndex((text) => text.includes('offset.value * scale'));

  assert.ok(line >= 0, result.ui);

  const original = originalPositionFor(map, {
    line: line + 1,
    column: lines[line]?.indexOf('offset') ?? 0,
  });

  assert.equal(original.source, '/app/fade.tsx');
  assert.equal(original.line, 5);
});
