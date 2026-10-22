import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { headlessApp } from './support/headless.ts';

// Layout props reach the shared engine by key, with their value as the host
// batch typed it (docs/native-scheduling.md#layout-props): no prop's name
// crosses, an enum crosses as its index, and only a length written as text
// carries a string, here on a 501-view first render.

test('a 501-view screen lays out with no layout prop crossing by name', async () => {
  const host = await headlessApp(join(ROOT, 'test/fixtures/wire/screen-app.tsx'));
  const cards = [...host.renderer.views.values()].filter((view) => view.kind === 'HStack');

  assert.equal(host.renderer.views.size, 501);
  assert.equal(cards.length, 50);
  // Each card's `width: 100%` is the only text: sizes are numbers, alignments indexes.
  assert.equal(host.renderer.engine.textValues, 50);

  const [first] = cards;

  assert.ok(first);

  const { x, y, width, height } = host.renderer.engine.box(first.node);

  assert.deepEqual(
    { x, y, width, height },
    { x: 16, y: 16, width: 402 - 32, height: 48 },
    'the screen pads its cards, which take its width',
  );
});
