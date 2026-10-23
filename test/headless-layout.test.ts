import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { HEADLESS_WASM_PIN, headlessInputs } from '../src/cli/headless-wasm.ts';
import { LayoutEngine } from '../src/tests/layout.ts';
import { HEADLESS_WASM } from '../src/tests/wasm.ts';

// The layout engine the headless host runs: native/shared/layout compiled to
// WebAssembly, checked in so an app's tests need no C++ toolchain.

test('the checked-in module is built from the current layout engine', async () => {
  const pin: unknown = JSON.parse(readFileSync(HEADLESS_WASM_PIN, 'utf8'));

  assert.deepEqual(
    pin,
    { inputs: await headlessInputs() },
    'the C++ it runs changed: run node scripts/build-headless-wasm.ts',
  );
});

// package.json's engines start at Node 22.18, whose V8 runs Wasm's legacy
// exception handling but not exnref, the encoding wasi-sdk emits by default.
test('the module compiles without exnref, as Node 22 runs it', () => {
  const compile = spawnSync(
    process.execPath,
    [
      '--no-experimental-wasm-exnref',
      '-e',
      'new WebAssembly.Module(require("node:fs").readFileSync(process.argv[1]))',
      HEADLESS_WASM,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(compile.status, 0, compile.stderr);
});

test('views lay out with their kind defaults and props, in points rounded to pixels', () => {
  const engine = new LayoutEngine();
  const root = engine.create('VStack');
  const row = engine.create('HStack');
  const label = engine.create('Text', (width, widthMode) => ({
    width: widthMode === 'exactly' ? width : 50.2,
    height: 20.3,
  }));
  const spacer = engine.create('Spacer');
  const icon = engine.create('Symbol');

  engine.set(root, 'padding', 10);
  engine.set(row, 'gap', 8);
  engine.set(icon, 'width', 24);
  engine.set(icon, 'height', '24');
  engine.insert(root, row, 0);
  engine.insert(row, label, 0);
  engine.insert(row, spacer, 1);
  engine.insert(row, icon, 2);
  engine.calculate(root, 402, 874, 3);

  // The engine computes in floats: compare to a thousandth of a point.
  const frame = (node: number) => {
    const { x, y, width, height } = engine.box(node);

    return [x, y, width, height].map((value) => Math.round(value * 1000) / 1000);
  };

  assert.deepEqual(frame(root), [0, 0, 402, 874]);
  assert.deepEqual(frame(row), [10, 10, 382, 24], 'a row stretches across its column');

  assert.deepEqual(
    frame(label),
    [0, 2, 50.333, 20.333],
    'centered, with edges on a third of a point, keeping the pixels it measured',
  );

  assert.deepEqual(frame(spacer), [58.333, 12, 291.667, 0], 'the spacer grows');
  assert.deepEqual(frame(icon), [358, 0, 24, 24]);
});

test('a scroll view reports its content size, and a reset prop takes the default again', () => {
  const engine = new LayoutEngine();
  const scroll = engine.create('Scroll');
  const tall = engine.create('Box');

  engine.set(tall, 'height', 2000);
  engine.insert(scroll, tall, 0);
  engine.calculate(scroll, 402, 874, 3);

  assert.deepEqual(engine.box(scroll).content, { width: 402, height: 2000 });

  engine.set(tall, 'height', null);
  engine.calculate(scroll, 402, 874, 3);
  assert.equal(engine.box(tall).height, 0);
});

test('a safe-area inset pads a node on top of its own padding', () => {
  const engine = new LayoutEngine();
  const screen = engine.create('NavigationScreen');
  const content = engine.create('Box');

  engine.set(screen, 'padding', 4);
  engine.setInset(screen, { top: 62, right: 0, bottom: 34, left: 0 });
  engine.insert(screen, content, 0);
  engine.calculate(screen, 402, 874, 3);

  assert.deepEqual(engine.box(content), {
    x: 4,
    y: 66,
    width: 394,
    height: 0,
    content: { width: 394, height: 0 },
    inset: { top: 0, right: 0, bottom: 0, left: 0 },
  });
});

test('invalid props, kinds and trees throw what the engine says', () => {
  const engine = new LayoutEngine();
  const box = engine.create('Box');

  assert.throws(() => engine.set(box, 'flexGrow', -1), /flexGrow must not be negative/);
  assert.throws(() => engine.set(box, 'color', 'red'), /color is not a layout property/);
  assert.throws(() => engine.create('Nope'), /no layout defaults for Nope/);
  assert.throws(() => engine.insert(box, box, 0), /cannot contain itself/);
  assert.throws(() => engine.create('Text'), /A Text is measured/);
  assert.equal(engine.isLayoutProperty('alignItems'), true);
  assert.equal(engine.isLayoutProperty('color'), false);
});

/** A 501-view screen: a column of 50 cards, each a row of eight boxes and a label. */
function cards(engine: LayoutEngine, measured: string[]) {
  const root = engine.create('VStack');
  const rows = Array.from({ length: 50 }, (_, index) => {
    const card = engine.create('HStack');
    const boxes = Array.from({ length: 8 }, () => engine.create('Box'));
    const label = engine.create('Text', (width) => {
      measured.push(`card ${index}`);

      return { width: Math.min(width, 120), height: 20 };
    });

    engine.set(card, 'width', '100%');
    engine.set(card, 'height', 48);
    engine.set(card, 'gap', 4);
    engine.insert(root, card, index);

    boxes.forEach((box, at) => {
      engine.set(box, 'width', 20);
      engine.set(box, 'height', 20);
      engine.insert(card, box, at);
    });

    engine.insert(card, label, boxes.length);

    return { card, boxes, label };
  });

  engine.calculate(root, 402, 874, 3);

  return { root, rows };
}

test('an animated width lays out the card it is in, not the 500-view screen', () => {
  const engine = new LayoutEngine();
  const measured: string[] = [];
  const { root, rows } = cards(engine, measured);
  const reference = new LayoutEngine();
  const twin = cards(reference, []);
  const card = rows[25];
  const twinCard = twin.rows[25];

  assert.ok(card && twinCard);
  measured.length = 0;

  for (let frame = 1; frame <= 10; frame++) {
    const width = 20 + frame * 4;
    const laidOut = engine.drive(card.boxes[0] ?? 0, 'width', width);

    assert.deepEqual(laidOut, [card.card, ...card.boxes, card.label], `frame ${frame}`);

    reference.set(twinCard.boxes[0] ?? 0, 'width', width);
    reference.calculate(twin.root, 402, 874, 3);

    const boxes = (tree: ReturnType<typeof cards>, of: LayoutEngine) =>
      [tree.root, ...tree.rows.flatMap((row) => [row.card, ...row.boxes, row.label])].map((node) =>
        of.box(node),
      );

    assert.deepEqual(boxes({ root, rows }, engine), boxes(twin, reference), `frame ${frame}`);
  }

  assert.deepEqual(
    measured.filter((card) => card !== 'card 25'),
    [],
    'no other card measures its label',
  );
});

test('a width that resizes the screen around it lays out the whole tree', () => {
  const engine = new LayoutEngine();
  const root = engine.create('VStack');
  const row = engine.create('HStack');
  const box = engine.create('Box');

  engine.insert(root, row, 0);
  engine.insert(row, box, 0);
  engine.set(box, 'height', 20);
  engine.calculate(root, NaN, NaN, 3);

  // The root wraps its row, which wraps the box: nothing stops the change.
  assert.equal(engine.drive(box, 'width', 40), null);
  assert.equal(engine.dirty(root), true);

  engine.calculate(root, NaN, NaN, 3);
  assert.equal(engine.box(root).width, 40);
});
