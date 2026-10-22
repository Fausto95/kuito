import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readModuleSpec, type FunctionMember, type ModuleSpec } from '../src/dev/modules/spec.ts';

// The module spec as the compiler reads it: without running it, from the
// TypeScript as written (docs/native-modules.md).

/** A spec's functions, without its events and live values. */
const functions = ({ members }: ModuleSpec) =>
  members.filter((member): member is FunctionMember => member.kind === 'function');

const read = (source: string) => readModuleSpec('modules/battery/battery.ts', source);

const spec = (members: string, prelude = '') =>
  read(`import { defineModule, fn } from 'kuito';
${prelude}
export default defineModule('Battery', {
${members}
});
`);

/** The error a spec fails with, as one line. */
function failure(source: string) {
  try {
    read(source);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  assert.fail('the spec should not read');
}

const failing = (members: string, prelude = '') =>
  failure(`import { defineModule, fn } from 'kuito';
${prelude}
export default defineModule('Battery', {
${members}
});
`);

test('a spec names its module and its functions in order, each with its thread', () => {
  const battery = spec(`
  level: fn.sync<() => number>(),
  monitor: fn.main<(enabled: boolean) => Promise<void>>(),
  history: fn.background<(days: number) => Promise<number[]>>(),
  requestAccess: fn.main.callback<() => Promise<boolean>>(),
`);

  assert.equal(battery.name, 'Battery');
  assert.equal(battery.file, 'modules/battery/battery.ts');

  assert.deepEqual(
    functions(battery).map(({ name, thread, callback }) => [name, thread, callback]),
    [
      ['level', 'js', false],
      ['monitor', 'main', false],
      ['history', 'background', false],
      ['requestAccess', 'main', true],
    ],
  );

  const [level, monitor, history] = functions(battery);

  assert.deepEqual(level.params, []);
  assert.deepEqual(level.result, { kind: 'number' });

  assert.deepEqual(monitor.params, [
    { name: 'enabled', type: { kind: 'boolean' }, optional: false },
  ]);

  assert.equal(monitor.result, null, 'Promise<void> resolves with nothing');
  assert.deepEqual(history.result, { kind: 'array', of: { kind: 'number' } });
  assert.equal(level.line, 5);
});

test('named string unions are enums and named object types are records, read through aliases', () => {
  const battery = spec(
    `
  configure: fn.main<(options: Options, mode?: Mode | null) => Promise<Report>>(),
`,
    `
export type Mode = 'saver' | 'normal';
type Percent = number;
interface Threshold { level: Percent; mode: Mode }
export type Options = {
  thresholds: readonly Threshold[];
  labels: Record<string, string>;
  note?: string;
  extra: Json;
};
type Report = { state: Mode; at: number | null };
`,
  );
  const [configure] = functions(battery);

  assert.deepEqual(configure.params, [
    { name: 'options', type: { kind: 'object', name: 'Options' }, optional: false },
    {
      name: 'mode',
      type: { kind: 'nullable', of: { kind: 'enum', name: 'Mode' } },
      optional: true,
    },
  ]);

  assert.deepEqual(configure.result, { kind: 'object', name: 'Report' });

  assert.deepEqual(battery.types, [
    { kind: 'enum', name: 'Mode', values: ['saver', 'normal'] },
    {
      kind: 'object',
      name: 'Threshold',
      fields: [
        { name: 'level', type: { kind: 'number' }, optional: false },
        { name: 'mode', type: { kind: 'enum', name: 'Mode' }, optional: false },
      ],
    },
    {
      kind: 'object',
      name: 'Options',
      fields: [
        {
          name: 'thresholds',
          type: { kind: 'array', of: { kind: 'object', name: 'Threshold' } },
          optional: false,
        },
        { name: 'labels', type: { kind: 'record', of: { kind: 'string' } }, optional: false },
        { name: 'note', type: { kind: 'string' }, optional: true },
        { name: 'extra', type: { kind: 'json' }, optional: false },
      ],
    },
    {
      kind: 'object',
      name: 'Report',
      fields: [
        { name: 'state', type: { kind: 'enum', name: 'Mode' }, optional: false },
        { name: 'at', type: { kind: 'nullable', of: { kind: 'number' } }, optional: false },
      ],
    },
  ]);
});

test('native needs are read as plain data, and the imports of other specs listed', () => {
  const battery = read(`import { defineModule, fn } from 'kuito';
import type { PermissionStatus } from '../permissions/permissions';
import '../app-state/app-state';

export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  ios: { class: 'BatteryModule', launch: true, frameworks: ['CoreHaptics'], infoPlist: { UIRequiresFullScreen: true } },
  android: {
    class: 'com.example.battery.BatteryModule',
    permissions: ['android.permission.BATTERY_STATS'],
    features: [{ name: 'android.hardware.sensor', required: false }],
  },
});
`);

  assert.deepEqual(battery.needs, {
    ios: {
      class: 'BatteryModule',
      launch: true,
      frameworks: ['CoreHaptics'],
      infoPlist: { UIRequiresFullScreen: true },
    },
    android: {
      class: 'com.example.battery.BatteryModule',
      permissions: ['android.permission.BATTERY_STATS'],
      features: [{ name: 'android.hardware.sensor', required: false }],
    },
  });

  assert.deepEqual(battery.imports, ['../permissions/permissions', '../app-state/app-state']);
});

test('a spec that is not a static declaration fails at its line', () => {
  assert.match(
    failure(`import { defineModule } from 'kuito';
export default defineModule('Bat' + 'tery', {});
`),
    /modules\/battery\/battery\.ts:2: defineModule needs the module's name as a string literal/,
  );

  assert.match(
    failure(`import { defineModule } from 'kuito';
export default defineModule('battery', {});
`),
    /:2: .*PascalCase/,
  );

  assert.match(
    failure(`import { fn } from 'kuito';
export type Level = number;
`),
    /modules\/battery\/battery\.ts: .*export default defineModule\(/,
  );

  assert.match(
    failing(`level: fn.sync<() => number>(),`, `console.log('loaded');`),
    /:2: a module spec holds imports, types and its defineModule; this statement would run/,
  );

  assert.match(
    failing(`level: makeLevel(),`),
    /:4: level must be fn\.sync, fn\.main or fn\.background/,
  );

  assert.match(failing(`...others,`), /:4: .*spread/);
  assert.match(failing(`level: fn.sync(),`), /:4: fn\.sync needs the function's type/);

  assert.match(
    failing(`ios: { class: ClassName },`),
    /:4: ios\.class must be a literal: strings, numbers, booleans, arrays and objects/,
  );

  assert.match(
    failing(`level: fn.sync<() => number>(),\n  level: fn.sync<() => number>(),`),
    /:5: level is declared twice/,
  );

  assert.match(failing(`then: fn.sync<() => number>(),`), /:4: then is reserved/);
});

test('an ArrayBuffer is bytes, in a parameter, a result or a field', () => {
  const files = spec(
    `
  read: fn.background<(uri: string) => Promise<ArrayBuffer>>(),
  write: fn.background<(chunk: Chunk) => Promise<void>>(),
`,
    `type Chunk = { bytes: ArrayBuffer; tail: ArrayBuffer | null };`,
  );
  const [read, write] = functions(files);

  assert.deepEqual(read.result, { kind: 'bytes' });
  assert.deepEqual(write.params[0].type, { kind: 'object', name: 'Chunk' });

  assert.deepEqual(
    files.types.find(({ name }) => name === 'Chunk'),
    {
      kind: 'object',
      name: 'Chunk',
      fields: [
        { name: 'bytes', type: { kind: 'bytes' }, optional: false },
        { name: 'tail', type: { kind: 'nullable', of: { kind: 'bytes' } }, optional: false },
      ],
    },
  );
});

test('a function whose types the platforms cannot share fails at its line', () => {
  assert.match(
    failing(`level: fn.sync<() => Promise<number>>(),`),
    /:4: level runs on the JS thread and returns its value: declare it fn\.main or fn\.background to return a Promise/,
  );

  assert.match(
    failing(`monitor: fn.main<(on: boolean) => void>(),`),
    /:4: monitor runs on the main thread, so it returns a Promise/,
  );

  assert.match(
    failing(`set: fn.main<(mode: 'saver' | 'normal') => Promise<void>>(),`),
    /:4: set's mode: name this union with a type alias \(type Mode = 'saver' \| 'normal'\)/,
  );

  assert.match(
    failing(`set: fn.main<(options: { on: boolean }) => Promise<void>>(),`),
    /:4: set's options: name this object type with a type alias/,
  );

  assert.match(
    failing(`at: fn.sync<() => Date>(),`),
    /:4: at's result: Date is not a type the platforms share/,
  );

  assert.match(
    failing(`set: fn.main<(value: string | number) => Promise<void>>(),`),
    /:4: set's value: a union is a string enum or adds null/,
  );

  assert.match(
    failing(
      `set: fn.main<(value: Options) => Promise<void>>(),`,
      `type Options = { run: () => void };`,
    ),
    /:2: Options\.run: a function is not a type the platforms share/,
  );
});

test('an event names its payload, and a live value its type', () => {
  const clipboard = spec(
    `
  change: event<Change>(),
  cleared: event(),
  hasText: live<boolean>(),
  scheme: live<Scheme | null>(),
`,
    `
type Change = { hasText: boolean };
type Scheme = 'light' | 'dark';`,
  );

  assert.deepEqual(
    clipboard.members.map((member) => [member.kind, member.name]),
    [
      ['event', 'change'],
      ['event', 'cleared'],
      ['live', 'hasText'],
      ['live', 'scheme'],
    ],
  );

  const [change, cleared, hasText, scheme] = clipboard.members;

  assert.deepEqual(change.kind === 'event' && change.payload, { kind: 'object', name: 'Change' });
  assert.equal(cleared.kind === 'event' && cleared.payload, null);
  assert.deepEqual(hasText.kind === 'live' && hasText.type, { kind: 'boolean' });

  assert.deepEqual(scheme.kind === 'live' && scheme.type, {
    kind: 'nullable',
    of: { kind: 'enum', name: 'Scheme' },
  });

  assert.match(failing(`hasText: live(),`), /:4: live needs the value's type: live<boolean>\(\)/);
});

test("a view's method may not shadow a member of the view's element", () => {
  assert.match(
    failing(
      `gauge: view<{ value: number }>({ methods: { focus: fn.main<() => Promise<void>>() } }),`,
      `import { view } from 'kuito';`,
    ),
    /:4: gauge\.focus is a member of the view's element; name the method otherwise/,
  );
});

test('a motion value names its type, and is null until the platform sets it', () => {
  const tracker = spec(
    `
  fix: motion<Fix>(),
`,
    `
type Fix = { latitude: number; longitude: number };`,
  );
  const [fix] = tracker.members;

  assert.deepEqual(fix.kind === 'motion' && [fix.name, fix.type], [
    'fix',
    { kind: 'nullable', of: { kind: 'object', name: 'Fix' } },
  ]);

  assert.match(failing(`fix: motion(),`), /:4: motion needs the value's type: motion<number>\(\)/);
});

test("a view's children flag is a boolean literal", () => {
  assert.match(
    failing(
      `menu: view<{ title?: string }>({ children: 'yes' }),`,
      `import { view } from 'kuito';`,
    ),
    /:4: menu\.children is true or false/,
  );
});
