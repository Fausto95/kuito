import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { measureText, textStyle, transformed, type FontTable } from '../src/tests/fonts.ts';
import { LayoutEngine } from '../src/tests/layout.ts';

// Text on the headless host is measured from a font table the test declares,
// the way UIKit sizes the iOS renderer's labels.

/** Every glyph 10 pt wide at 20 pt, `i` 4, with T then o kerned in by 2. */
const FONTS: FontTable = {
  faces: [
    {
      weight: 400,
      size: 20,
      lineHeight: 24.2,
      advances: { i: 4 },
      fallback: 10,
      kerning: { To: -2 },
    },
    { weight: 700, size: 20, lineHeight: 25, advances: {}, fallback: 12 },
  ],
};

const style = (props: Record<string, unknown> = {}) => textStyle({ fontSize: 20, ...props });

const measure = (text: string, width = Infinity, props: Record<string, unknown> = {}) =>
  measureText(
    FONTS,
    3,
    text,
    style(props),
    width,
    width === Infinity ? 'undefined' : 'atMost',
    NaN,
    'undefined',
  );

test('a line is its glyphs’ advances, and a size rounds up to the next pixel', () => {
  assert.deepEqual(measure('hi'), { width: 14, height: 24.333333333333332 });

  assert.deepEqual(measure('hi', Infinity, { fontSize: 10 }), {
    width: 7,
    height: 12.333333333333334,
  });

  assert.deepEqual(measure(''), { width: 0, height: 0 });
});

test('text wraps at spaces, keeps a trailing space on its last line, and breaks a long word', () => {
  assert.deepEqual(measure('aa bb cc', 55), { width: 50, height: 48.666666666666664 }, 'two lines');
  assert.equal(measure('aa ').width, 30, 'a trailing space counts');
  assert.deepEqual(measure('aaaaaa', 35), { width: 30, height: 48.666666666666664 });
  assert.equal(measure('a\nb').height, 48.666666666666664, 'a newline breaks the line');
  assert.equal(measure('aa bb cc', 55, { lineClamp: 1 }).height, 24.333333333333332, 'lineClamp');
  assert.equal(measure('aa bb', 100, { lineHeight: 30 }).height, 30, 'a lineHeight sets each line');
});

test('letterSpacing tracks every glyph, and turns on the font’s kerning as UIKit does', () => {
  assert.equal(measure('To').width, 20, 'a kern of zero turns kerning off');
  assert.equal(measure('To', Infinity, { letterSpacing: 1 }).width, 20, '10 + 1 + 10 + 1 - 2');
});

test('a face is picked by weight, then size; others scale from the nearest', () => {
  assert.equal(measure('aa', Infinity, { fontWeight: 'bold' }).width, 24);
  assert.equal(measure('aa', Infinity, { fontWeight: '600' }).width, 24, '600 is nearer 700');
  assert.equal(measure('aa', Infinity, { fontSize: 40 }).width, 40);
});

test('min-content is the widest word; an exact width is the width given', () => {
  const minContent = measureText(FONTS, 3, 'a bbb cc', style(), 0, 'minContent', NaN, 'undefined');
  const exact = measureText(FONTS, 3, 'a', style(), 120, 'exactly', 40, 'exactly');

  assert.deepEqual(minContent, { width: 30, height: 72.66666666666667 });
  assert.deepEqual(exact, { width: 120, height: 40 });
});

test('labels in a row too narrow for them shrink to their share, not below their widest word', () => {
  const engine = new LayoutEngine();
  const root = engine.create('VStack');
  const row = engine.create('HStack');
  const label = (text: string) =>
    engine.create('Text', (width, widthMode, height, heightMode) =>
      measureText(FONTS, 3, text, style(), width, widthMode, height, heightMode),
    );
  const title = label('aaaa bbbbbbbbbbbb cc');
  const detail = label('dd ee ff gg');

  engine.insert(root, row, 0);
  engine.insert(row, title, 0);
  engine.insert(row, detail, 1);
  engine.calculate(root, 150, 400, 3);

  const frame = (node: number) => {
    const { x, y, width, height } = engine.box(node);

    return [x, y, width, height].map((value) => Math.round(value * 1000) / 1000);
  };

  assert.deepEqual(frame(title), [0, 12.333, 120, 72.667], 'no narrower than bbbbbbbbbbbb');
  assert.deepEqual(frame(detail), [120, 0, 30, 97], 'the rest, a word a line');
});

test('textTransform changes what is measured and shown', () => {
  assert.equal(transformed('reel', 'uppercase'), 'REEL');
  assert.equal(transformed('Reel', 'lowercase'), 'reel');
  assert.equal(transformed('top rated', 'capitalize'), 'Top Rated');
  assert.equal(transformed('Reel', 'none'), 'Reel');
});
