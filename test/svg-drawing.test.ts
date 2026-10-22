import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { svgDrawing } from '../src/dev/svg-drawing.ts';

// An SVG file's text as the shapes a Drawing draws (docs/drawing.md): the
// same reader as Android's VectorDrawable conversion, whose paint and
// transforms become a Drawing's resolved shapes. Pure: text in, data out.

const svg = (body: string, attributes = 'viewBox="0 0 24 24"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;

test('the viewBox comes from the file, else its size', () => {
  assert.deepEqual(svgDrawing(svg('')).viewBox, [0, 0, 24, 24]);
  assert.deepEqual(svgDrawing(svg('', 'width="40" height="20"')).viewBox, [0, 0, 40, 20]);
  assert.deepEqual(svgDrawing(svg('', 'viewBox="-2 -2 28,28"')).viewBox, [-2, -2, 28, 28]);
});

test("each shape keeps SVG's paint, with opacities folded into its colors", () => {
  const [plain, painted] = svgDrawing(
    svg(
      '<path d="M0 0h1"/>' +
        '<rect width="4" height="2" fill="rgb(0, 0, 255)" fill-opacity="0.5" stroke="#0f0" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="bevel" stroke-dasharray="1 2" ' +
        'fill-rule="evenodd" opacity="0.5"/>',
    ),
  ).shapes;

  assert.equal(plain.d, 'M0 0h1');
  assert.equal(plain.fill, '#000000ff');
  assert.equal(plain.stroke, null);
  assert.equal(painted.d, 'M0,0h4v2h-4z');
  assert.equal(painted.fill, '#0000ff80');
  assert.equal(painted.stroke, '#00ff00ff');
  assert.equal(painted.strokeWidth, 2);
  assert.equal(painted.strokeLinecap, 'round');
  assert.equal(painted.strokeLinejoin, 'bevel');
  assert.deepEqual(painted.strokeDasharray, [1, 2]);
  assert.equal(painted.fillRule, 'evenodd');
  assert.equal(painted.opacity, 0.5);
});

test('groups pass their paint and transforms down, any matrix included', () => {
  const [shape] = svgDrawing(
    svg(
      '<g fill="blue" transform="translate(10 20)"><g transform="matrix(1 0 1 1 0 0)">' +
        '<circle r="1" style="stroke: white"/></g></g>',
    ),
  ).shapes;

  assert.equal(shape.fill, '#0000ffff');
  assert.equal(shape.stroke, '#ffffffff', 'style declarations over attributes');
  assert.deepEqual(shape.transform, [1, 0, 1, 1, 10, 20], 'a skew is a matrix like any other');

  assert.deepEqual(
    svgDrawing(svg('<path d="M0 0" transform="rotate(90)"/>')).shapes[0].transform.map(
      (value) => Math.round(value * 1000) / 1000,
    ),
    [0, 1, -1, 0, 0, 0],
  );
});

test('hidden elements and empty shapes draw nothing; what a Drawing lacks is an error', () => {
  assert.deepEqual(
    svgDrawing(svg('<path d="M0 0" display="none"/><title>x</title><defs/><polygon points=""/>'))
      .shapes,
    [],
  );

  for (const [body, element] of [
    ['<text>Hi</text>', '<text>'],
    ['<path d="M0 0" fill="url(#g)"/>', 'a url(#g) paint (gradients and patterns)'],
    ['<path d="M0 0" clip-path="url(#c)"/>', '<path clip-path>'],
    ['<use href="#a"/>', '<use>'],
  ])
    assert.throws(
      () => svgDrawing(svg(body)),
      new RegExp(`a Drawing cannot draw ${element.replace(/[()#]/g, '\\$&')}`),
    );
});
