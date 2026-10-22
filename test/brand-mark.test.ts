import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** The brand master (branding/README.md): its paths and its gradient's stops. */
function brandMark() {
  const svg = read('apps/website/public/kuito-mark.svg');
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  const stops = [...svg.matchAll(/offset="(\d+)%" stop-color="#([0-9a-f]{6})"/g)].map(
    ([, offset, color]) => ({ offset: Number(offset) / 100, color }),
  );

  assert.equal(paths.length, 3, 'the mark is three paths');
  assert.equal(stops.length, 3, 'filled by one three-stop gradient');

  return { paths, stops };
}

test('the dev shells draw the brand mark from the master’s own paths and colors', () => {
  const { paths, stops } = brandMark();
  const shells = {
    ios: read('native/ios/App/Devtools/KuitoBrandMark.swift'),
    android: read('native/android/app/src/debug/java/dev/kuito/runtime/devtools/KuitoBrandMark.kt'),
  };

  for (const [platform, source] of Object.entries(shells)) {
    for (const path of paths) assert.ok(source.includes(`"${path}"`), `${platform} draws ${path}`);

    for (const { offset, color } of stops) {
      assert.match(source, new RegExp(`0x${color}\\b`, 'i'), `${platform} has #${color}`);
      assert.ok(source.includes(String(offset)), `${platform} stops at ${offset}`);
    }
  }
});

test('the startup screen and the devtools show the brand mark, not a placeholder glyph', () => {
  for (const file of [
    'native/ios/App/Devtools/KuitoLoadingView.swift',
    'native/ios/App/Devtools/KuitoDevtoolsController.swift',
    'native/android/app/src/debug/java/dev/kuito/runtime/devtools/KuitoLoadingView.kt',
    'native/android/app/src/debug/java/dev/kuito/runtime/devtools/KuitoDevtoolsSheet.kt',
  ]) {
    const source = read(file);

    assert.match(source, /KuitoBrandMark\(/, `${file} draws the mark`);
    assert.doesNotMatch(source, /◆/, `${file} has no placeholder glyph`);
  }
});
