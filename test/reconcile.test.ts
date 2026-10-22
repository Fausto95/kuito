import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { longestIncreasing, moves } from '../src/runtime/reconcile.ts';
import { arrayWork } from './support/array-work.ts';

function permutations(items: number[]): number[][] {
  if (items.length < 2) return [items];

  return items.flatMap((item, index) =>
    permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]),
  );
}

/** Moves as a host applies them: the id leaves its place, then lands at the index. */
function apply(order: number[], steps: [number, number][]): number[] {
  const result = order.slice();

  steps.forEach(([id, index]) => {
    result.splice(result.indexOf(id), 1);
    result.splice(index, 0, id);
  });

  return result;
}

test('the longest increasing run is found and kept in order', () => {
  const values = [3, 1, 4, 1.5, 5, 9, 2, 6];
  const kept = [...longestIncreasing(values)].sort((a, b) => a - b).map((index) => values[index]);

  assert.equal(kept.length, 4);
  assert.ok(kept.every((value, index) => index === 0 || kept[index - 1] < value));
});

test('moves reach every order of up to six children with the fewest moves', () => {
  for (let size = 0; size <= 6; size++) {
    const current = Array.from({ length: size }, (_, index) => index);

    permutations(current).forEach((wanted) => {
      const steps = moves(current, wanted);

      assert.deepEqual(apply(current, steps), wanted);
      assert.equal(steps.length, size - longestIncreasing(wanted).size);
    });
  }
});

test('reversing 10k ids moves all but one, with array work linear in their count', () => {
  const ids = (size: number) => Array.from({ length: size }, (_, index) => index);
  const reverse = (size: number) => {
    const current = ids(size);
    const wanted = current.slice().reverse();
    let steps: [number, number][] = [];
    const work = arrayWork(() => (steps = moves(current, wanted)));

    return { current, wanted, steps, work };
  };
  const large = reverse(10_000);

  assert.equal(large.steps.length, 9_999);
  assert.deepEqual(apply(large.current, large.steps), large.wanted);

  const growth = large.work / reverse(2_500).work;

  assert.ok(growth < 6, `4x the ids took ${growth.toFixed(1)}x the array work`);
});
