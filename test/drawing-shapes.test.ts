import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  Circle,
  drawnShapes,
  Ellipse,
  Group,
  Line,
  Path,
  Polygon,
  Polyline,
  Rectangle,
} from '../src/native/drawing-shapes.ts';

// A Drawing's children as the shapes the native view draws: each a path's
// `d` in user units, its paint resolved through its Groups, and the matrix
// its Groups and its own transform make. Pure: elements in, data out.

const element = (type: unknown, props: Record<string, unknown>) => ({ type, props });

const one = (type: unknown, props: Record<string, unknown>) => {
  const [shape] = drawnShapes(element(type, props));

  return shape;
};

test('each shape is a path in user units', () => {
  assert.equal(one(Path, { d: 'M0 0L10 10' }).d, 'M0 0L10 10');

  assert.equal(one(Rectangle, { x: 1, y: 2, width: 10, height: 20 }).d, 'M1 2H11V22H1Z');

  assert.equal(
    one(Rectangle, { width: 10, height: 20, rx: 2 }).d,
    'M2 0H8A2 2 0 0 1 10 2V18A2 2 0 0 1 8 20H2A2 2 0 0 1 0 18V2A2 2 0 0 1 2 0Z',
    'rounded corners, ry taking rx',
  );

  assert.equal(
    one(Rectangle, { width: 10, height: 4, rx: 8 }).d,
    'M5 0H5A5 2 0 0 1 10 2V2A5 2 0 0 1 5 4H5A5 2 0 0 1 0 2V2A5 2 0 0 1 5 0Z',
    'radii past half the side stop at half',
  );

  assert.equal(one(Circle, { cx: 5, cy: 5, r: 5 }).d, 'M10 5A5 5 0 1 1 0 5A5 5 0 1 1 10 5Z');

  assert.equal(
    one(Ellipse, { cx: 5, cy: 2, rx: 5, ry: 2 }).d,
    'M10 2A5 2 0 1 1 0 2A5 2 0 1 1 10 2Z',
    'clockwise from the right, as SVG draws it, so dashes start where they do there',
  );

  assert.equal(one(Line, { x1: 0, y1: 0, x2: 4, y2: 3 }).d, 'M0 0L4 3');

  assert.equal(
    one(Polyline, {
      points: [
        [0, 0],
        [4, 0],
        [4, 3],
      ],
    }).d,
    'M0 0L4 0L4 3',
  );

  assert.equal(
    one(Polygon, {
      points: [
        [0, 0],
        [4, 0],
        [4, 3],
      ],
    }).d,
    'M0 0L4 0L4 3Z',
  );
});

test("paint takes SVG's defaults, and a Group's paint is inherited", () => {
  const plain = one(Path, { d: 'M0 0' });

  assert.equal(plain.fill, '#000000ff', 'black, as SVG fills');

  assert.equal(plain.stroke, null, 'no stroke');

  assert.equal(plain.strokeWidth, 1);

  assert.equal(plain.strokeLinecap, 'butt');

  assert.equal(plain.strokeLinejoin, 'miter');

  assert.equal(plain.strokeMiterlimit, 4);

  assert.deepEqual(plain.strokeDasharray, []);

  assert.equal(plain.fillRule, 'nonzero');

  assert.equal(plain.opacity, 1);

  const [inherited, own] = drawnShapes(
    element(Group, {
      fill: 'none',
      stroke: '#f00',
      strokeWidth: 2,
      opacity: 0.5,
      children: [
        element(Path, { d: 'M0 0' }),
        element(Circle, { r: 1, stroke: '#00ff0080', opacity: 0.5 }),
      ],
    }),
  );

  assert.equal(inherited.fill, null);

  assert.equal(inherited.stroke, '#ff0000ff', 'hex colors arrive whole, alpha last');

  assert.equal(inherited.strokeWidth, 2);

  assert.equal(inherited.opacity, 0.5);

  assert.equal(own.stroke, '#00ff0080', "a shape's own paint wins");

  assert.equal(own.opacity, 0.25, 'opacity multiplies');
});

test('transforms compose from the outermost Group in', () => {
  const [shape] = drawnShapes(
    element(Group, {
      translateX: 10,
      translateY: 20,
      children: element(Group, {
        scale: 2,
        children: element(Path, { d: 'M0 0', rotate: 90 }),
      }),
    }),
  );

  const [a, b, c, d, e, f] = shape.transform;

  assert.deepEqual(
    [a, b, c, d, e, f].map((value) => Math.round(value * 1000) / 1000),
    [0, 2, -2, 0, 10, 20],
    'translate, then scale, then rotate: x maps to (10, 20 + 2x)',
  );

  assert.deepEqual(one(Path, { d: 'M0 0' }).transform, [1, 0, 0, 1, 0, 0]);
});

test('children may be lists, conditions and signals; anything else is an error', () => {
  const shown = { value: true };

  const list = drawnShapes([
    element(Path, { d: 'M1 1' }),
    [element(Path, { d: 'M2 2' }), false, null],
    { value: element(Path, { d: 'M3 3' }) },
    shown.value && element(Path, { d: 'M4 4' }),
  ]);

  assert.deepEqual(
    list.map(({ d }) => d),
    ['M1 1', 'M2 2', 'M3 3', 'M4 4'],
  );

  assert.throws(
    () => drawnShapes(element('Text', {})),
    /A Drawing draws Path, Rectangle, Circle, Ellipse, Line, Polyline, Polygon and Group, not Text/,
  );

  assert.throws(() => drawnShapes('label'), /A Drawing draws shapes, not the text "label"/);
});

test('invalid paint and geometry are errors naming the shape', () => {
  assert.throws(
    () => one(Path, { d: 'M0 0', fill: 'red' }),
    /Path fill takes a hex color or "none", not "red"/,
  );

  assert.throws(() => one(Circle, { r: -1 }), /Circle r is a length from 0, not -1/);

  assert.throws(() => one(Path, {}), /Path takes its data in d/);

  assert.throws(
    () => one(Path, { d: 'M0 0', strokeDasharray: [1, -1] }),
    /Path strokeDasharray takes lengths from 0, not -1/,
  );
});

test('a shape with no size draws nothing, as SVG disables it', () => {
  const drawn = drawnShapes([
    element(Rectangle, { width: 0, height: 10, stroke: '#000' }),
    element(Circle, { r: 0, stroke: '#000', strokeLinecap: 'round' }),
    element(Ellipse, { rx: 5, ry: 0, stroke: '#000' }),
    element(Polygon, { points: [] }),
    element(Polyline, { points: [] }),
    element(Path, { d: '' }),
  ]);

  assert.deepEqual(drawn, []);
});

test("a stroke of no width is none, and dashes follow SVG's rules on both platforms", () => {
  assert.equal(one(Path, { d: 'M0 0', stroke: '#000', strokeWidth: 0 }).stroke, null);

  assert.deepEqual(
    one(Path, { d: 'M0 0', strokeDasharray: [1, 2, 3] }).strokeDasharray,
    [1, 2, 3, 1, 2, 3],
    'an odd list repeats to make an even one',
  );

  assert.deepEqual(
    one(Path, { d: 'M0 0', strokeDasharray: [0, 0] }).strokeDasharray,
    [],
    'dashes that sum to 0 draw a solid line',
  );
});
