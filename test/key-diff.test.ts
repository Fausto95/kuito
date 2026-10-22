import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { keyDiff, type KeyEdit } from '../src/runtime/key-diff.ts';

/** The edits as a native list applies them: each to the keys the ones before it left. */
function apply(keys: readonly string[], edits: KeyEdit[]): string[] {
  const result = keys.slice();

  edits.forEach(({ op, index, key }) => {
    if (op === 'insert') {
      assert.ok(!result.includes(key), `${key} is inserted once`);
      assert.ok(index <= result.length, `${key} is inserted inside the list`);
      result.splice(index, 0, key);
    } else if (op === 'remove') {
      assert.equal(result[index], key, `${key} is removed from where it is`);
      result.splice(index, 1);
    } else {
      assert.ok(result.includes(key), `${key} moves from the list`);
      result.splice(result.indexOf(key), 1);
      assert.ok(index <= result.length, `${key} moves inside the list`);
      result.splice(index, 0, key);
    }
  });

  return result;
}

const counts = (edits: KeyEdit[]) =>
  edits.reduce<Record<string, number>>((sum, { op }) => ({ ...sum, [op]: (sum[op] ?? 0) + 1 }), {});

test('equal keys need no edits', () => {
  assert.deepEqual(keyDiff(['a', 'b'], ['a', 'b']), []);
  assert.deepEqual(keyDiff([], []), []);
});

test('the first keys arrive as insertions in order, each at the end', () => {
  assert.deepEqual(keyDiff([], ['a', 'b', 'c']), [
    { op: 'insert', index: 0, key: 'a' },
    { op: 'insert', index: 1, key: 'b' },
    { op: 'insert', index: 2, key: 'c' },
  ]);
});

test('an append is one insertion and a removal one removal', () => {
  assert.deepEqual(keyDiff(['a', 'b'], ['a', 'b', 'c']), [{ op: 'insert', index: 2, key: 'c' }]);
  assert.deepEqual(keyDiff(['a', 'b', 'c'], ['a', 'c']), [{ op: 'remove', index: 1, key: 'b' }]);

  assert.deepEqual(keyDiff(['a', 'b'], []), [
    { op: 'remove', index: 0, key: 'a' },
    { op: 'remove', index: 0, key: 'b' },
  ]);
});

test('one key moved to the end is one move, not a shift of every other key', () => {
  assert.deepEqual(keyDiff(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a']), [
    { op: 'move', index: 3, key: 'a' },
  ]);
});

test('removals come first, then moves, then insertions at their final index', () => {
  const old = ['a', 'b', 'c', 'd'];
  const next = ['d', 'a', 'e', 'c'];
  const edits = keyDiff(old, next);

  assert.deepEqual(edits, [
    { op: 'remove', index: 1, key: 'b' },
    { op: 'move', index: 0, key: 'd' },
    { op: 'insert', index: 2, key: 'e' },
  ]);

  assert.deepEqual(apply(old, edits), next);
});

test('every reordering, growth and shrink of a few keys applies to the new keys', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = () => pool.filter(() => random() < 0.6).sort(() => random() - 0.5);

  for (let run = 0; run < 500; run++) {
    const old = pick();
    const next = pick();
    const edits = keyDiff(old, next);
    const removed = old.filter((key) => !next.includes(key)).length;
    const added = next.filter((key) => !old.includes(key)).length;
    const { remove = 0, insert = 0 } = counts(edits);

    assert.deepEqual(apply(old, edits), next, `${old.join()} → ${next.join()}`);
    assert.equal(remove, removed, `${old.join()} → ${next.join()} removes only what left`);
    assert.equal(insert, added, `${old.join()} → ${next.join()} inserts only what is new`);
  }
});

test('a reversal is all moves', () => {
  const old = Array.from({ length: 50 }, (_, index) => 'k' + index);
  const next = [...old].reverse();
  const edits = keyDiff(old, next);

  assert.deepEqual(counts(edits), { move: 49 });
  assert.deepEqual(apply(old, edits), next);
});

test('repeated keys fail and name the key', () => {
  assert.throws(() => keyDiff([], ['a', 'b', 'a']), /"a"/);
});
