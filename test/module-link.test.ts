import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { catalogOf } from '../src/dev/modules/catalog.ts';
import { moduleStubs } from '../src/dev/modules/stubs.ts';

// Every module function gets an id when the compiler reads the specs, and
// each spec compiles to one stub per function, bound to its id
// (docs/native-modules.md).

const battery = {
  file: '/app/modules/battery/battery.ts',
  source: `import { defineModule, fn } from 'kuito';
export type Mode = 'saver' | 'normal';
type Options = { mode: Mode; note?: string; levels: number[] };
export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  configure: fn.main<(options: Options, label?: string | null) => Promise<void>>(),
  ios: { class: 'BatteryModule' },
});
`,
};

const clock = {
  file: '/app/modules/clock/clock.ts',
  source: `import { defineModule, fn } from 'kuito';
export default defineModule('Clock', {
  now: fn.background<() => Promise<number>>(),
  android: { class: 'com.example.ClockModule' },
});
`,
};

test('ids number every function of every module, by module name then declaration', () => {
  const catalog = catalogOf([clock, battery]);

  assert.deepEqual(
    catalog.members.map(({ id, module, member }) => [id, `${module.name}.${member.name}`]),
    [
      [1, 'Battery.level'],
      [2, 'Battery.configure'],
      [3, 'Clock.now'],
    ],
  );

  assert.equal(catalog.byFile.get(clock.file)?.spec.name, 'Clock');
  assert.equal(catalogOf([battery, clock]).hash, catalog.hash, 'the order found does not matter');
  assert.notEqual(catalogOf([battery]).hash, catalog.hash, 'another set of functions renumbers');
});

test('two modules with one name are an error naming both files', () => {
  assert.throws(
    () =>
      catalogOf([battery, { ...battery, file: '/framework/native/modules/battery/battery.ts' }]),
    /Battery is declared by both \/app\/modules\/battery\/battery\.ts and \/framework\/native\/modules\/battery\/battery\.ts/,
  );
});

test("a spec's stubs bind each function to its id, with its thread and argument schema", () => {
  const catalog = catalogOf([battery, clock]);
  const code = moduleStubs(catalog, 'Battery');

  assert.match(
    code,
    /const level = \/\* @__PURE__ \*\/ globalThis\.__kuito\.link\(1, "Battery\.level", "js", \[\]\);/,
  );

  assert.match(code, /export \{ level as level \};/);

  const linked: unknown[][] = [];

  runInNewContext(code.replace(/^export .*$/gm, ''), {
    globalThis: { __kuito: { link: (...args: unknown[]) => linked.push(args) } },
  });

  // Arrays from the stub's realm, compared as data.
  assert.deepEqual(JSON.parse(JSON.stringify(linked)), [
    [1, 'Battery.level', 'js', []],
    [
      2,
      'Battery.configure',
      'main',
      [
        [
          'o',
          [
            ['mode', ['e', 'saver', 'normal']],
            ['note', ['?', 's']],
            ['levels', ['a', 'n']],
          ],
        ],
        ['?', 's'],
      ],
      // Main-thread and answering at once: UI-thread code calls it directly.
      true,
    ],
  ]);
});

test('a member named like a reserved word is exported under its name', () => {
  const storage = {
    file: '/app/modules/store/store.ts',
    source: `import { defineModule, fn } from 'kuito';
export default defineModule('Store', {
  delete: fn.background<(key: string) => Promise<void>>(),
  ios: { class: 'StoreModule' },
});
`,
  };

  const code = moduleStubs(catalogOf([storage]), 'Store');

  assert.match(code, /const \$delete = .*\n/);
  assert.match(code, /export \{ \$delete as delete \};/);
});

test('an event and a live value bind to their ids too', () => {
  const clipboard = {
    file: '/app/modules/clip/clip.ts',
    source: `import { defineModule, event, live } from 'kuito';
export default defineModule('Clip', {
  change: event<Change>(),
  hasText: live<boolean>(),
  ios: { class: 'ClipModule' },
});
type Change = { hasText: boolean };
`,
  };
  const code = moduleStubs(catalogOf([clipboard]), 'Clip');

  assert.match(
    code,
    /const change = \/\* @__PURE__ \*\/ globalThis\.__kuito\.linkEvent\(1, "Clip\.change"\);/,
  );

  assert.match(
    code,
    /const hasText = \/\* @__PURE__ \*\/ globalThis\.__kuito\.linkLive\(2, "Clip\.hasText"\);/,
  );
});

test('a motion value binds to its id', () => {
  const tracker = {
    file: '/app/modules/tracker/tracker.ts',
    source: `import { defineModule, motion } from 'kuito';
export default defineModule('Tracker', {
  fix: motion<number>(),
  ios: { class: 'TrackerModule' },
});
`,
  };

  assert.match(
    moduleStubs(catalogOf([tracker]), 'Tracker'),
    /const fix = \/\* @__PURE__ \*\/ globalThis\.__kuito\.linkMotion\(1, "Tracker\.fix"\);/,
  );
});

test('a view binds to its id with its events, and says whether it takes children', () => {
  const views = {
    file: '/app/modules/menus/menus.ts',
    source: `import { defineModule, view } from 'kuito';
export default defineModule('Menus', {
  view: view<{ title?: string }>({ events: ['select'], children: true }),
  ios: { class: 'MenusModule' },
});
`,
  };
  const leaf = {
    file: '/app/modules/gauge/gauge.ts',
    source: `import { defineModule, view } from 'kuito';
export default defineModule('Gauge', {
  view: view<{ value?: number }>({ events: ['change'] }),
  ios: { class: 'GaugeModule' },
});
`,
  };
  const catalog = catalogOf([views, leaf]);

  assert.match(
    moduleStubs(catalog, 'Menus'),
    /globalThis\.__kuito\.linkView\(\d+, "Menus", \["select"\], \{  \}, true\)/,
  );

  assert.match(
    moduleStubs(catalog, 'Gauge'),
    /globalThis\.__kuito\.linkView\(\d+, "Gauge", \["change"\], \{  \}, false\)/,
  );
});
