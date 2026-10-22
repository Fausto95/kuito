import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateProtocol } from '../src/protocol/generate.ts';
import { flattenValue } from '../src/protocol/prop-schemas.ts';
import { GRADIENT, IMAGE_SOURCE } from '../src/protocol/schemas.ts';
import { MANIFEST, type Manifest } from '../src/protocol/manifest.ts';
import { generateStyleDocs } from '../src/style/docs.ts';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('every prop’s effect class is generated into the native tables', () => {
  const header = read('native/shared/PropKeys.generated.h');
  const effects = header.match(/PropEffect::(?:Paint|Measure|Layout|Structure)/g);

  assert.match(header, /enum class PropEffect/);
  assert.equal(effects?.length, Object.keys(MANIFEST.props).length);
  assert.match(read('native/ios/Renderer/KuitoProps.generated.swift'), /effectByKey/);

  assert.match(
    read('native/android/app/src/main/java/dev/kuito/runtime/renderer/KuitoProps.generated.kt'),
    /effectByKey/,
  );
});

test('the checked-in protocol files are what the manifest generates', () => {
  for (const [path, text] of Object.entries(generateProtocol(MANIFEST, read)))
    assert.equal(read(path), text, `${path} is stale: run npm run generate`);
});

test("docs/styles.md's property table is what the style compiler generates", () => {
  assert.equal(
    read('docs/styles.md'),
    generateStyleDocs(read('docs/styles.md')),
    'run npm run generate',
  );
});

test('generating from generated files changes nothing', () => {
  const first = generateProtocol(MANIFEST, read);
  const second = generateProtocol(MANIFEST, (path) => first[path] ?? read(path));

  assert.deepEqual(second, first);
});

test('the kernel tables and prop types come from the manifest', () => {
  const files = generateProtocol(MANIFEST, read);
  const kernel = files['src/runtime/protocol.generated.ts'];
  const types = files['src/ui/props.generated.d.ts'];

  assert.match(kernel, /export const NATIVE_KINDS: readonly string\[\] = \[\n {2}'VStack',/);
  assert.match(kernel, /Image: \{ placeholder: 'placeholderColor' \}/);
  assert.match(kernel, /onScroll: \{ event: 'scroll', announce: 'emitsScroll'/);
  assert.doesNotMatch(kernel.slice(kernel.indexOf('LAYOUT_PROPS')), /^ {2}hidden: true,$/m);
  assert.match(types, /PressableNativeProps \{[^}]*haptic\?: Prop<'light' \| 'medium' \|/);
  assert.match(types, /export interface SheetNativeProps \{[^}]*open: Bound<boolean>;/);

  assert.doesNotMatch(
    types,
    /ImageNativeProps \{[^}]*placeholderColor/,
    'Image takes only its alias, placeholder',
  );

  const elementProperties = types.slice(types.indexOf('export interface ElementProperties {'));

  assert.match(elementProperties, /^ {2}opacity: number;$/m);
  assert.match(elementProperties, /^ {2}objectFit: 'cover' \| 'contain' \| 'fill' \| 'none';$/m);

  assert.doesNotMatch(types, /emitsScroll/, 'internal props are not typed');
});

test('a docs row naming a prop its kind does not take is rejected', () => {
  const manifest: Manifest = {
    ...MANIFEST,
    kinds: {
      ...MANIFEST.kinds,
      Pressable: { ...MANIFEST.kinds.Pressable, docs: [{ props: ['edges'], text: 'Pads.' }] },
    },
  };

  assert.throws(() => generateProtocol(manifest, read), /Pressable docs list edges/);
});

test('an alias on a kind that does not take the prop is rejected', () => {
  const manifest: Manifest = {
    ...MANIFEST,
    props: {
      ...MANIFEST.props,
      tintColor: { ...MANIFEST.props.tintColor, aliases: { Text: { name: 'tint' } } },
    },
  };

  assert.throws(() => generateProtocol(manifest, read), /tintColor has an alias on Text/);
});

test('an event prop listening to an event no view sends is rejected', () => {
  const manifest: Manifest = {
    ...MANIFEST,
    eventProps: { ...MANIFEST.eventProps, onWiggle: { event: 'wiggle' } },
  };

  assert.throws(() => generateProtocol(manifest, read), /onWiggle listens to unknown event wiggle/);
});

test('each event payload has one fixed layout, the same in the kernels, C++, Swift and Kotlin', () => {
  const files = generateProtocol(MANIFEST, read);
  const kernel = files['src/runtime/protocol.generated.ts'];
  const cpp = files['native/shared/EventLayouts.generated.h'];
  const swift = files['native/ios/Renderer/KuitoEvents.generated.swift'];
  const kotlin =
    files['native/android/app/src/main/java/dev/kuito/runtime/renderer/KuitoEvents.generated.kt'];
  const hash = /EVENT_LAYOUT_HASH = (0x[0-9a-f]{8});/.exec(kernel)?.[1];

  assert.match(
    kernel,
    /name: 'BindCellsPayload',\n {4}numbers: \[\],\n {4}strings: \['cell', 'key'\],/,
  );

  assert.match(
    kernel,
    /scroll: \{ Scroll: \d+, HorizontalScroll: \d+, List: \d+, HorizontalList: \d+ \}/,
  );

  assert.match(kernel, /'keyboard\.didshow': \d+,/);
  assert.ok(hash, 'the kernel has the layouts’ fingerprint');
  assert.match(cpp, new RegExp(`kEventLayoutHash = ${hash};`), 'C++ checks the same one');
  assert.match(cpp, /\{"ScrollPayload", 6, 0\},/);

  assert.match(
    swift,
    /struct KuitoTextPayload: KuitoEventPayload \{\n {4}static let layout: Int32 = \d+\n {4}var text: String\n/,
  );

  assert.match(swift, /record\.number\(oldState \?\? \.nan\)/);

  assert.match(
    kotlin,
    /internal class KuitoValuePayload\(\n {4}val value: Boolean,\n\) : KuitoEventPayload/,
  );

  assert.match(kotlin, /record\.number\(if \(value\) 1\.0 else 0\.0\)/);
});

test('an event whose payload has no layout fails generation', () => {
  const manifest: Manifest = {
    ...MANIFEST,
    events: { ...MANIFEST.events, wiggle: { Box: 'WigglePayload' } },
  };

  assert.throws(
    () => generateProtocol(manifest, read),
    /event wiggle names payload WigglePayload, which has no layout in PAYLOADS/,
  );
});

test('each structured prop has one schema: C++ tables, a TypeScript flattener, Swift and Kotlin types', () => {
  const files = generateProtocol(MANIFEST, read);
  const cpp = files['native/shared/PropSchemas.generated.h'];
  const swift = files['native/ios/Renderer/KuitoPropValues.generated.swift'];
  const kotlin =
    files[
      'native/android/app/src/main/java/dev/kuito/runtime/renderer/KuitoPropValues.generated.kt'
    ];

  assert.match(cpp, /\{SchemaWhen::Has, "uri", nullptr, \d+\}, +\/\/ ImageSource\.remote/);

  assert.match(
    swift,
    /static func gestures\(_ record: KuitoStructRecord\) -> \[KuitoGestureSpecValue\]/,
  );

  assert.match(swift, /enum KuitoImageSourceValue: Equatable \{\n {4}case url\(String\)/);

  assert.match(
    kotlin,
    /internal data class KuitoGradientValue\(\n {4}val angle: Double,\n {4}val colors: List<Int>,/,
  );

  assert.match(
    kotlin,
    /data class Remote\(val value: KuitoRemoteImageValue\) : KuitoImageSourceValue/,
  );

  // The same layout C++ makes (test/native-batch.cpp checks it there).
  assert.deepEqual(flattenValue(GRADIENT, { angle: 90, colors: ['#ffffff', '#0008'] }), {
    numbers: [90, 2, 0xffffffff, 0x00000088],
    strings: [],
  });

  assert.deepEqual(
    flattenValue(IMAGE_SOURCE, {
      uri: 'https://example.com/a.png',
      headers: { Authorization: 'Bearer x' },
    }),
    { numbers: [2, 1, 1], strings: ['https://example.com/a.png', 'Authorization', 'Bearer x'] },
  );
});

test('a json prop a renderer receives without a schema fails generation', () => {
  const { schema: _schema, ...edges } = MANIFEST.props.edges;
  const manifest: Manifest = { ...MANIFEST, props: { ...MANIFEST.props, edges } };

  assert.throws(() => generateProtocol(manifest, read), /edges is json without a schema/);
});

test('the module protocol is one thread enum and the error codes on each platform', () => {
  const files = generateProtocol(MANIFEST, read);
  const swift = files['native/ios/Modules/KuitoModuleProtocol.generated.swift'];
  const kotlin =
    files[
      'native/android/app/src/main/java/dev/kuito/runtime/modules/KuitoModuleProtocol.generated.kt'
    ];

  assert.match(swift, /enum KuitoThread: String \{\n {4}case js, main, background\n/);
  assert.match(swift, /static let argument = "ERR_ARGUMENT"/);
  assert.match(kotlin, /enum class KuitoThread\(val wire: String\) \{\n {4}JS\("js"\),/);
  assert.match(kotlin, /const val ARGUMENT = "ERR_ARGUMENT"/);

  assert.match(
    files['docs/native-modules.md'],
    /\| `ERR_THREAD` +\| A synchronous call reached an asynchronous function\. +\|/,
  );
});

test('the Live Patch link is one message enum per direction on each platform', () => {
  const files = generateProtocol(MANIFEST, read);
  const swift = files['native/ios/App/KuitoDevLink.generated.swift'];
  const kotlin =
    files['native/android/app/src/main/java/dev/kuito/runtime/KuitoDevLink.generated.kt'];

  assert.match(
    swift,
    /enum KuitoServerMessage: String \{\n {4}case patch, command, symbolicated\n\}/,
  );

  assert.match(
    swift,
    /enum KuitoDeviceMessage: String \{\n {4}case hello, log, open, applied, rejected, recording\n\}/,
  );

  assert.match(
    kotlin,
    /enum class KuitoServerMessage\(val type: String\) \{\n {4}PATCH\("patch"\),/,
  );

  assert.match(kotlin, /fun of\(type: String\): KuitoServerMessage\? =/);

  assert.match(
    kotlin,
    /enum class KuitoDeviceMessage\(val type: String\) \{\n {4}HELLO\("hello"\),/,
  );
});
