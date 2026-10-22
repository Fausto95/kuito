import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { catalogOf } from '../src/dev/modules/catalog.ts';
import { kotlinLink } from '../src/cli/link-kotlin.ts';
import { swiftLink } from '../src/cli/link-swift.ts';

// The shell's side of a module spec: a Swift protocol and a Kotlin
// interface its implementation conforms to, and a link table of only the
// functions the bundle calls (docs/native-modules.md).

const battery = {
  file: '/app/modules/battery/battery.ts',
  source: `import { defineModule, fn } from 'kuito';
export type Mode = 'saver' | 'low-power';
type Options = { mode: Mode; note?: string; limits: Record<string, number>; at: number | null };
export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  configure: fn.main<(options: Options, label?: string | null) => Promise<Options>>(),
  history: fn.background<(days: number) => Promise<number[]>>(),
  requestAccess: fn.main.callback<() => Promise<boolean>>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.battery.BatteryModule' },
});
`,
};

const clock = {
  file: '/app/modules/clock/clock.ts',
  source: `import { defineModule, fn } from 'kuito';
export default defineModule('Clock', {
  now: fn.sync<() => number>(),
  ios: { class: 'ClockModule' },
  android: { class: 'com.example.ClockModule' },
});
`,
};

const catalog = catalogOf([battery, clock]);
const modules = catalog.modules.filter(({ spec }) => spec.name === 'Battery');

test('the Swift protocol declares every function, on its thread, with the spec’s types', () => {
  const swift = swiftLink(catalog, modules, [1, 2]);

  assert.match(swift, /protocol BatterySpec: KuitoLinkedModule \{/);
  assert.match(swift, /\n {4}func level\(\) throws -> Double\n/);

  assert.match(
    swift,
    /\n {4}@MainActor func configure\(_ options: Options, _ label: String\?\) throws -> Options\n/,
  );

  assert.match(swift, /\n {4}func history\(_ days: Double\) throws -> \[Double\]\n/);
  assert.match(swift, /\n {4}@MainActor func requestAccess\(_ promise: KuitoPromise<Bool>\)\n/);
  assert.match(swift, /enum Mode: String \{\n {4}case saver\n {4}case lowPower = "low-power"\n\}/);

  assert.match(
    swift,
    /struct Options \{\n {4}var mode: Mode\n {4}var note: String\?\n {4}var limits: \[String: Double\]\n {4}var at: Double\?\n\}/,
  );
});

test('the Swift link table holds only the functions the bundle calls', () => {
  const swift = swiftLink(catalog, modules, [2]);

  assert.match(
    swift,
    /case 2: return KuitoFunction\("Battery\.configure", thread: \.main, arity: 2, signature: "\(\{mode:e,note\?:s,limits:%n,at:\?n\},\?s\)\{mode:e,note\?:s,limits:%n,at:\?n\}"\)/,
  );

  assert.match(swift, /let module = link\.battery\(\)/);
  assert.match(swift, /try MainActor\.assumeIsolated \{ try module\.configure\(/);
  assert.doesNotMatch(swift, /case 1:|"Battery\.level"|"Battery\.history"/);
  assert.doesNotMatch(swift, /Clock/, 'a module the shell does not include is not named');

  assert.match(
    swift,
    /fileprivate func battery\(\) -> some BatterySpec \{ module\("Battery", BatteryModule\.self\) \}/,
  );
});

test('the Kotlin interface and link table mirror the Swift ones', () => {
  const kotlin = kotlinLink(catalog, modules, [2, 4]);

  assert.match(kotlin, /^package dev\.kuito\.link$/m);
  assert.match(kotlin, /interface BatterySpec : KuitoLinkedModule \{/);
  assert.match(kotlin, /\n {4}fun level\(\): Double\n/);
  assert.match(kotlin, /\n {4}fun configure\(options: Options, label: String\?\): Options\n/);
  assert.match(kotlin, /\n {4}fun history\(days: Double\): List<Double>\n/);
  assert.match(kotlin, /\n {4}fun requestAccess\(promise: KuitoPromise<Boolean>\)\n/);

  assert.match(
    kotlin,
    /enum class Mode\(override val wire: String\) : KuitoEnum \{\n {4}SAVER\("saver"\),\n {4}LOW_POWER\("low-power"\),\n\}/,
  );

  assert.match(
    kotlin,
    /data class Options\(\n {4}val mode: Mode,\n {4}val note: String\? = null,\n {4}val limits: Map<String, Double>,\n {4}val at: Double\?,\n\)/,
  );

  assert.match(
    kotlin,
    /2 -> KuitoFunction\("Battery\.configure", KuitoThread\.MAIN, 2, "\(\{mode:e,note\?:s,limits:%n,at:\?n\},\?s\)\{mode:e,note\?:s,limits:%n,at:\?n\}"\) \{ link, args, reply ->/,
  );

  assert.match(kotlin, /val module: BatterySpec = link\.battery\(\)/);

  assert.match(
    kotlin,
    /private fun KuitoLinkContext\.battery\(\) = module\("Battery"\) \{ com\.example\.battery\.BatteryModule\(it\) \}/,
  );

  assert.match(
    kotlin,
    /4 -> KuitoFunction\("Battery\.requestAccess", KuitoThread\.MAIN, 0, "\(\)b"\)/,
  );

  assert.doesNotMatch(kotlin, /\b1 ->|\b3 ->|Clock/);
});

test('a struct crosses as its fields in declared order, and stays a map for JSON data', () => {
  const swift = swiftLink(catalog, modules, [2]);
  const kotlin = kotlinLink(catalog, modules, [2]);

  assert.ok(
    swift.includes(
      '            mode: try value.field(0, "mode").enumeration(Mode.self),\n' +
        '            note: try value.field(1, "note").optional { try $0.string() },',
    ),
    swift,
  );

  assert.ok(
    swift.includes(
      '    func kuitoFields() -> [Any] {\n        [\n            mode.rawValue,\n' +
        '            note.map { $0 as Any } ?? NSNull(),\n            limits,\n' +
        '            (at.map { $0 as Any } ?? NSNull()),\n        ]\n    }',
    ),
    swift,
  );

  assert.ok(swift.includes('        if let value = note { fields["note"] = value }'), swift);

  assert.ok(
    swift.includes('let result = try MainActor.assumeIsolated { try module.configure(a0, a1) }'),
  );

  assert.ok(swift.includes('reply.resolve(result.kuitoFields())'), swift);

  assert.ok(
    kotlin.includes(
      '            mode = value.field(0, "mode").enumeration(Mode.values()),\n' +
        '            note = value.field(1, "note").optional { it.string() },',
    ),
    kotlin,
  );

  assert.ok(
    kotlin.includes(
      '    override fun kuitoFields(): List<Any?> = listOf(\n        mode.wire,\n        note,\n        limits,\n        at,\n    )',
    ),
    kotlin,
  );

  assert.ok(kotlin.includes('        note?.let { put("note", it) }'), kotlin);
  assert.ok(kotlin.includes('reply.resolve(result.kuitoFields())'), kotlin);
});

test('a struct that contains itself is named once in its signature, then referred to', () => {
  const tree = catalogOf([
    {
      file: '/app/modules/tree/tree.ts',
      source: `import { defineModule, fn } from 'kuito';
type Node = { name: string; children: Node[] };
export default defineModule('Tree', {
  read: fn.sync<() => Node>(),
  ios: { class: 'TreeModule' },
  android: { class: 'com.example.TreeModule' },
});
`,
    },
  ]);

  assert.ok(
    swiftLink(tree, tree.modules, [1]).includes('signature: "()=Node{name:s,children:[^Node}"'),
  );

  assert.ok(kotlinLink(tree, tree.modules, [1]).includes('0, "()=Node{name:s,children:[^Node}")'));
});

test('an ArrayBuffer is Data in Swift and a ByteBuffer in Kotlin, and x in its signature', () => {
  const files = catalogOf([
    {
      file: '/app/modules/files/files.ts',
      source: `import { defineModule, fn } from 'kuito';
type Chunk = { bytes: ArrayBuffer; tail?: ArrayBuffer };
export default defineModule('Files', {
  read: fn.background<(uri: string) => Promise<ArrayBuffer>>(),
  write: fn.background<(chunk: Chunk) => Promise<void>>(),
  ios: { class: 'FilesModule' },
  android: { class: 'com.example.FilesModule' },
});
`,
    },
  ]);
  const swift = swiftLink(files, files.modules, [1, 2]);
  const kotlin = kotlinLink(files, files.modules, [1, 2]);

  assert.match(swift, /\n {4}func read\(_ uri: String\) throws -> Data\n/);
  assert.match(swift, /struct Chunk \{\n {4}var bytes: Data\n {4}var tail: Data\?\n\}/);
  assert.ok(swift.includes('bytes: try value.field(0, "bytes").bytes(),'), swift);
  assert.ok(swift.includes('signature: "(s)x"'), swift);
  assert.ok(swift.includes('signature: "({bytes:x,tail?:x})_"'), swift);

  assert.match(kotlin, /\n {4}fun read\(uri: String\): java\.nio\.ByteBuffer\n/);

  assert.match(
    kotlin,
    /val bytes: java\.nio\.ByteBuffer,\n {4}val tail: java\.nio\.ByteBuffer\? = null,/,
  );

  assert.ok(kotlin.includes('bytes = value.field(0, "bytes").bytes(),'), kotlin);
});

test('the shell launches the included modules that ask for it, and only those', () => {
  const tasks = catalogOf([
    {
      file: '/app/modules/tasks/tasks.ts',
      source: `import { defineModule, fn } from 'kuito';
export default defineModule('Tasks', {
  run: fn.main<() => Promise<void>>(),
  ios: { class: 'TasksModule', launch: true },
  android: { class: 'com.example.TasksModule', launch: true },
});
`,
    },
    clock,
  ]);

  assert.match(
    swiftLink(tasks, tasks.modules, []),
    /@MainActor static func launch\(\) \{\n {8}TasksModule\.launch\(\)\n {4}\}/,
  );

  assert.match(
    kotlinLink(tasks, tasks.modules, []),
    /fun launch\(application: android\.app\.Application\) \{\n {8}com\.example\.TasksModule\.launch\(application\)\n {4}\}/,
  );

  const without = tasks.modules.filter(({ spec }) => spec.name === 'Clock');

  assert.match(swiftLink(tasks, without, []), /@MainActor static func launch\(\) \{\n {4}\}/);
});

test('two included modules that declare one type name are an error naming both', () => {
  const other = {
    file: '/app/modules/charger/charger.ts',
    source: `import { defineModule, fn } from 'kuito';
export type Mode = 'fast' | 'slow';
export default defineModule('Charger', {
  set: fn.main<(mode: Mode) => Promise<void>>(),
  ios: { class: 'ChargerModule' },
});
`,
  };
  const both = catalogOf([battery, other]);

  assert.throws(
    () => swiftLink(both, both.modules, []),
    /Mode is declared by both .*battery\.ts and .*charger\.ts: the shell compiles both, so rename one/,
  );
});

test('an event and a live value start and stop on the main thread, and a live value reads on the JS thread', () => {
  const clip = {
    file: '/app/modules/clip/clip.ts',
    source: `import { defineModule, event, live } from 'kuito';
type Change = { hasText: boolean };
export default defineModule('Clip', {
  change: event<Change>(),
  cleared: event(),
  hasText: live<boolean>(),
  ios: { class: 'ClipModule' },
  android: { class: 'com.example.ClipModule' },
});
`,
  };
  const linked = catalogOf([clip]);
  const swift = swiftLink(linked, linked.modules, [1, 3]);
  const kotlin = kotlinLink(linked, linked.modules, [1, 3]);

  assert.match(
    swift,
    /\n {4}@MainActor func startChange\(_ emitter: KuitoEmitter<Change>\)\n {4}@MainActor func stopChange\(\)\n/,
  );

  assert.match(swift, /\n {4}@MainActor func startCleared\(_ emitter: KuitoEmitter<Void>\)\n/);

  assert.match(
    swift,
    /\n {4}func hasText\(\) throws -> Bool\n {4}@MainActor func startHasText\(_ signal: KuitoSignal<Bool>\)\n {4}@MainActor func stopHasText\(\)\n/,
  );

  assert.match(swift, /static func observer\(_ id: Int32\) -> KuitoObserver\? \{/);

  assert.match(
    swift,
    /case 1: return KuitoObserver\("Clip\.change", signature: "\(\)\{hasText:b\}"\) \{ link, emit in/,
  );

  assert.match(
    swift,
    /case 3: return KuitoFunction\("Clip\.hasText", thread: \.js, arity: 0, signature: "\(\)b"\)/,
  );

  assert.match(swift, /case 3: return KuitoObserver\("Clip\.hasText", signature: "\(\)b"\)/);
  assert.doesNotMatch(swift, /"Clip\.cleared"/);

  assert.match(
    kotlin,
    /\n {4}fun startChange\(emitter: KuitoEmitter<Change>\)\n {4}fun stopChange\(\)\n/,
  );

  assert.match(
    kotlin,
    /\n {4}fun hasText\(\): Boolean\n {4}fun startHasText\(signal: KuitoSignal<Boolean>\)\n/,
  );

  assert.match(kotlin, /fun observer\(id: Int\): KuitoObserver\? = when \(id\) \{/);

  assert.match(kotlin, /1 -> KuitoObserver\("Clip\.change", "\(\)\{hasText:b\}", \{ link, emit ->/);
});

test('a view’s method finds its mounted view on the main thread, where a missing one throws', () => {
  const camera = catalogOf([
    {
      file: '/app/modules/camera/camera.ts',
      source: `import { defineModule, fn, view } from 'kuito';
export default defineModule('Camera', {
  preview: view<{ zoom: number }>({
    methods: {
      snap: fn.main.callback<(quality: number) => Promise<string>>(),
      pause: fn.main<() => Promise<void>>(),
    },
  }),
  ios: { class: 'CameraModule' },
  android: { class: 'com.example.CameraModule' },
});
`,
    },
  ]);
  const swift = swiftLink(camera, camera.modules, [2, 3]);

  assert.match(
    swift,
    /try MainActor\.assumeIsolated \{ module\.snap\(try KuitoModuleViews\.shared\.linked\(view\), a0, promise\) \}/,
  );

  assert.match(
    swift,
    /try MainActor\.assumeIsolated \{ try module\.pause\(try KuitoModuleViews\.shared\.linked\(view\)\) \}/,
  );
});

test('an enum value’s words make its Kotlin constant, camel case included', () => {
  const accuracy = catalogOf([
    {
      file: '/app/modules/finder/finder.ts',
      source: `import { defineModule, fn } from 'kuito';
export type Accuracy = 'low' | 'bestForNavigation' | 'low-power';
export default defineModule('Finder', {
  locate: fn.main<(accuracy: Accuracy) => Promise<void>>(),
  ios: { class: 'FinderModule' },
  android: { class: 'com.example.FinderModule' },
});
`,
    },
  ]);
  const kotlin = kotlinLink(accuracy, accuracy.modules, [1]);
  const swift = swiftLink(accuracy, accuracy.modules, [1]);

  assert.match(
    kotlin,
    /BEST_FOR_NAVIGATION\("bestForNavigation"\),\n {4}LOW_POWER\("low-power"\),/,
  );

  assert.match(swift, /case bestForNavigation\n {4}case lowPower = "low-power"/);
});

test('a motion value starts and stops on the main thread, writing the UI runtime', () => {
  const tracker = {
    file: '/app/modules/tracker/tracker.ts',
    source: `import { defineModule, motion } from 'kuito';
type Fix = { latitude: number };
export default defineModule('Tracker', {
  fix: motion<Fix>(),
  ios: { class: 'TrackerModule' },
  android: { class: 'com.example.TrackerModule' },
});
`,
  };
  const linked = catalogOf([tracker]);
  const swift = swiftLink(linked, linked.modules, [1]);
  const kotlin = kotlinLink(linked, linked.modules, [1]);

  assert.match(
    swift,
    /\n {4}@MainActor func startFix\(_ motion: KuitoMotion<Fix\?>\)\n {4}@MainActor func stopFix\(\)\n/,
  );

  assert.match(
    swift,
    /case 1: return KuitoObserver\("Tracker\.fix", signature: "\(\)\?\{latitude:n\}", motion: true\) \{ link, emit in/,
  );

  assert.match(swift, /let sender = KuitoMotion<Fix\?>\(emit\)/);
  assert.doesNotMatch(swift, /KuitoFunction\("Tracker\.fix"/, 'nothing reads it on the JS thread');

  assert.match(kotlin, /\n {4}fun startFix\(motion: KuitoMotion<Fix\?>\)\n {4}fun stopFix\(\)\n/);

  assert.match(
    kotlin,
    /1 -> KuitoObserver\("Tracker\.fix", "\(\)\?\{latitude:n\}", \{ link, emit ->/,
  );

  assert.match(kotlin, /module\.startFix\(KuitoMotion<Fix\?>\(emit\)/);
  assert.match(kotlin, /\}, motion = true\)/);
});
