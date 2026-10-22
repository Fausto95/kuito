import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, type Manifest } from '../src/protocol/manifest.ts';
import { MODULES } from '../src/protocol/modules.ts';
import {
  moduleDrift,
  protocolDrift,
  readNativeSources,
  unsetDrift,
  type NativeSources,
} from './support/native-sources.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const sources = readNativeSources(root);

/** The sources with one file's text changed. */
function edited(
  platform: 'ios' | 'android',
  path: string,
  edit: (text: string) => string,
): NativeSources {
  const swap = (list: NativeSources['ios']['renderer']) =>
    list.map((source) =>
      source.path.endsWith(path) ? { ...source, text: edit(source.text) } : source,
    );
  const changed = sources[platform];

  return {
    ...sources,
    [platform]: {
      ...changed,
      properties: swap(changed.properties),
      renderer: swap(changed.renderer),
      modules: swap(changed.modules),
    },
  };
}

test('both renderers consult a prop’s effect before marking layout', () => {
  const usesEffect = (list: { path: string; text: string }[]) =>
    list.some((source) => source.text.includes('KuitoProps.effectByKey'));

  assert.equal(usesEffect(sources.ios.renderer), true);
  assert.equal(usesEffect(sources.android.renderer), true);
});

test('both renderers implement exactly the props, kinds and events the manifest lists', () => {
  assert.deepEqual(protocolDrift(MANIFEST, sources), []);
});

test('a manifest prop without a Kotlin setter is drift', () => {
  const manifest: Manifest = {
    ...MANIFEST,
    props: {
      ...MANIFEST.props,
      glowRadius: {
        effect: 'paint',
        concern: 'decoration',
        type: 'number',
        unset: { value: 0 },
        kinds: 'all',
      },
    },
  };

  assert.deepEqual(protocolDrift(manifest, sources), [
    "ios: glowRadius has no setter in the renderer's properties/ tables",
    "android: glowRadius has no setter in the renderer's properties/ tables",
  ]);
});

test('a prop one platform lacks is drift unless the manifest says so', () => {
  const manifest: Manifest = {
    ...MANIFEST,
    props: { ...MANIFEST.props, haptic: { ...MANIFEST.props.haptic, platforms: ['ios'] } },
  };

  assert.match(
    protocolDrift(manifest, sources).join('\n'),
    /^android: .* sets haptic, which the manifest does not mark for android$/m,
  );
});

test('a setter outside the manifest is drift', () => {
  const extra = edited('android', 'KuitoPressProperties.kt', (text) =>
    text.replace('"haptic" to', '"glow" to pressable { _, _ -> },\n        "haptic" to'),
  );

  assert.match(
    protocolDrift(MANIFEST, extra).join('\n'),
    /^android: .*KuitoPressProperties\.kt:\d+ sets glow, which src\/protocol\/manifest\.ts does not list$/m,
  );
});

test("a setter in another concern's table is drift", () => {
  const moved = edited('ios', 'KuitoPressProperties.swift', (text) =>
    text.replace('"hitArea":', '"tintColor": pressable { _, _ in },\n        "hitArea":'),
  );

  assert.match(protocolDrift(MANIFEST, moved).join('\n'), /tintColor has two setters/);

  assert.match(
    protocolDrift(MANIFEST, moved).join('\n'),
    /tintColor is a image prop, but its setter is in .*KuitoPressProperties\.swift/,
  );
});

test('an event sent with a payload type the manifest does not give it is drift', () => {
  const swapped = edited('ios', 'KuitoScrollView.swift', (text) =>
    text.replace('emit?("scroll", KuitoScrollPayload(', 'emit?("scroll", KuitoTouchPayload('),
  );

  assert.match(
    protocolDrift(MANIFEST, swapped).join('\n'),
    /^ios: .*KuitoScrollView\.swift:\d+ sends scroll with TouchPayload; the manifest gives it ScrollPayload$/m,
  );
});

test('an event sent with a dictionary rather than its generated payload is drift', () => {
  const untyped = edited('android', 'KuitoImageView.kt', (text) =>
    text.replace(
      'emit("load", KuitoImageSizePayload(width.toDouble(), height.toDouble()))',
      'emit("load", mapOf("width" to width, "height" to height))',
    ),
  );

  assert.match(
    protocolDrift(MANIFEST, untyped).join('\n'),
    /^android: .*KuitoImageView\.kt:\d+ sends load with dictionary; the manifest gives it ImageSizePayload$/m,
  );
});

test('a payload one platform never sends an event with is drift', () => {
  const missing = edited('android', 'KuitoImageView.kt', (text) =>
    text.replace(
      'emit("load", KuitoImageSizePayload(width.toDouble(), height.toDouble()))',
      'emit("load", null)',
    ),
  );

  assert.deepEqual(
    protocolDrift(MANIFEST, missing).map((line) => line.replace(/\.kt:\d+ /, '.kt:N ')),
    [
      'android: native/android/app/src/main/java/dev/kuito/runtime/renderer/views/KuitoImageView.kt:N sends load with no payload; the manifest gives it ImageSizePayload',
      'android: no renderer file sends load with ImageSizePayload, which the manifest gives it',
    ],
  );
});

test("both renderers take null as each prop's unset rule says", () => {
  assert.deepEqual(unsetDrift(MANIFEST, sources), []);
});

test('a setter that reads null for a prop unset to a value is drift', () => {
  const own = edited('android', 'KuitoPressProperties.kt', (text) =>
    text.replace(
      'view.activeOpacity = context.number(value).coerceIn(0f, 1f)',
      'view.activeOpacity = if (value == KuitoValue.Null) 0.5f else context.number(value)',
    ),
  );

  assert.match(
    unsetDrift(MANIFEST, own).join('\n'),
    /^android: .*KuitoPressProperties\.kt:\d+ reads null for pressedOpacity, which the manifest unsets to 1$/m,
  );
});

test("a renderer that doesn't resolve null through the unset rules is drift", () => {
  const unwired = edited('ios', 'KuitoProperty.swift', (text) =>
    text.replaceAll('KuitoProps.unsetByKey', 'KuitoProps.byKey'),
  );

  assert.deepEqual(unsetDrift(MANIFEST, unwired), [
    'ios: no properties/ file resolves null through KuitoProps.unsetByKey',
  ]);
});

test('PropKeys.generated.h compiles and names every manifest prop in order', (t) => {
  const compiler = process.env.CXX || 'c++';

  if (spawnSync(compiler, ['--version']).error) return t.skip('C++ toolchain unavailable');

  const folder = mkdtempSync(join(tmpdir(), 'kuito-prop-keys-'));

  try {
    const program = join(folder, 'prop-keys');
    const main = join(folder, 'main.cpp');

    writeFileSync(
      main,
      `#include "PropKeys.generated.h"
#include <iostream>
int main() {
  static_assert(kuito::kPropCount == ${Object.keys(MANIFEST.props).length});
  for (const auto& prop : kuito::kProps) {
    const auto key = kuito::propKey(prop.name);
    if (!key || &kuito::propInfo(*key) != &prop) return 1;
    std::cout << prop.name << '\\n';
  }
  return kuito::propKey("noSuchProp") ? 1 : 0;
}
`,
    );

    const build = spawnSync(
      compiler,
      [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        join(root, 'native/shared'),
        main,
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr);

    const run = spawnSync(program, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.stdout.trim().split('\n'), Object.keys(MANIFEST.props));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('the module hosts take their error codes and threads from the protocol', () => {
  assert.deepEqual(moduleDrift(MODULES, sources), []);
});

test('a module host spelling a host error code is drift', () => {
  const spelled = edited('android', 'modules/KuitoModule.kt', (text) =>
    text.replace('package dev.kuito.runtime.modules\n', '$&\nval code = "ERR_ARGUMENT"\n'),
  );

  assert.match(
    moduleDrift(MODULES, spelled).join('\n'),
    /^android: .*KuitoModule\.kt:\d+ spells ERR_ARGUMENT; use KuitoErrorCode's argument$/m,
  );
});

test('both renderers read every image source the src schema has, a remote one with its headers', () => {
  const schema = MANIFEST.props.src.schema;

  assert.ok(schema && typeof schema === 'object' && 'oneOf' in schema, 'src is a oneOf');

  const variants = schema.variants.map((variant) => variant.name);
  const reads = {
    ios: (name: string) => `case .${name}(`,
    android: (name: string) =>
      `is KuitoImageSourceValue.${name.charAt(0).toUpperCase()}${name.slice(1)} ->`,
  };

  for (const platform of ['ios', 'android'] as const) {
    const table = sources[platform].properties.find(({ path }) =>
      /KuitoImageProperties\.(swift|kt)$/.test(path),
    );

    assert.ok(table, `${platform} has an image table`);

    for (const variant of variants)
      assert.ok(
        table.text.includes(reads[platform](variant)),
        `${platform} reads a ${variant} source`,
      );

    assert.ok(table.text.includes('.headers'), `${platform} sends a remote source its headers`);
  }
});

test('both shells switch over every Live Patch message and send theirs by the generated names', () => {
  const ios = [
    'native/ios/App/Debug/KuitoDeviceConnection.swift',
    'native/ios/App/Debug/KuitoViewController.swift',
  ]
    .map((path) => readFileSync(join(root, path), 'utf8'))
    .join('\n');
  const android = readFileSync(
    join(root, 'native/android/app/src/debug/java/dev/kuito/runtime/KuitoActivity.kt'),
    'utf8',
  );
  const { server, device } = MANIFEST.devLink;

  for (const type of Object.keys(server)) {
    assert.match(ios, new RegExp(`case \\.${type}\\b`), `iOS handles ${type}`);

    assert.match(
      android,
      new RegExp(`KuitoServerMessage\\.${type.toUpperCase()} ->`),
      `Android handles ${type}`,
    );
  }

  for (const type of Object.keys(device)) {
    assert.match(ios, new RegExp(`KuitoDeviceMessage\\.${type}\\.rawValue`), `iOS sends ${type}`);

    assert.match(
      android,
      new RegExp(`KuitoDeviceMessage\\.${type.toUpperCase()}\\.type`),
      `Android sends ${type}`,
    );
  }
});
