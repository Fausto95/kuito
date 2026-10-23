import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { pathBounds } from '../src/dev/path-bounds.ts';

const near = (actual: number[] | null, expected: number[]) => {
  assert.ok(actual, 'the path has bounds');

  assert.deepEqual(
    actual.map((value) => Math.round(value * 1e6) / 1e6),
    expected,
  );
};

test('lines bound a path by their points, relative commands included', () => {
  near(pathBounds('M1 1L5 5'), [1, 1, 5, 5]);
  near(pathBounds('m1 1l4 4h2v-3z'), [1, 1, 7, 5]);
  near(pathBounds('M92.39 48 99.38 203.63 122.32 245.53Z'), [92.39, 48, 122.32, 245.53]);
});

test('curves bound a path at their extremes, not their control points', () => {
  near(pathBounds('M0 0C0 10 10 10 10 0'), [0, 0, 10, 7.5]);
  near(pathBounds('M0 0Q5 10 10 0'), [0, 0, 10, 5]);
  near(pathBounds('M0 0C0 10 10 10 10 0S20 -10 20 0'), [0, -7.5, 20, 7.5]);
  near(pathBounds('M0 0Q5 10 10 0T20 0'), [0, -5, 20, 5]);
});

test('arcs bound a path where they turn', () => {
  near(pathBounds('M0,5a5,5 0 1 0 10,0a5,5 0 1 0 -10,0z'), [0, 0, 10, 10]);
  near(pathBounds('M0 5A5 5 0 0 1 10 5'), [0, 0, 10, 5]);
});

test('a path with no segment has no bounds', () => {
  assert.equal(pathBounds(''), null);
});
