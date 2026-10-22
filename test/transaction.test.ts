import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { commit } from '../src/runtime/state/batch.ts';
import { atomically, remember, rememberEntry } from '../src/runtime/transaction.ts';

const abort = (work: () => void) =>
  assert.throws(
    () =>
      atomically(() => {
        work();
        throw new Error('abort');
      }),
    /abort/,
  );

test('an entry written, rewritten and aborted comes back as it was before the commit', () => {
  const sent = new Map([[1, { opacity: 1 }]]);
  const copy = (entries: { opacity: number }) => ({ ...entries });

  abort(() => {
    rememberEntry(sent, 1, copy);
    sent.get(1)!.opacity = 0.5;
    rememberEntry(sent, 1, copy);
    sent.get(1)!.opacity = 0;
    rememberEntry(sent, 2);
    sent.set(2, { opacity: 1 });
    rememberEntry(sent, 2);
    sent.set(2, { opacity: 0 });
  });

  assert.deepEqual([...sent], [[1, { opacity: 1 }]]);
});

test('a key written, rewritten and aborted comes back as it was before the commit', () => {
  const lists: Record<string, string> = { feed: 'a' };

  abort(() => {
    remember(lists, 'feed');
    lists.feed = 'b';
    remember(lists, 'feed');
    lists.feed = 'c';
    remember(lists, 'inbox');
    lists.inbox = 'b';
    remember(lists, 'inbox');
    lists.inbox = 'c';
  });

  assert.deepEqual(lists, { feed: 'a' });
});

test('a commit journals each entry once, however often it writes it', () => {
  const sent = new Map([[1, { opacity: 1 }]]);
  const lists: Record<string, string> = { feed: 'a' };
  let journaled = 0;

  atomically(() => {
    for (let index = 0; index < 50; index++) {
      rememberEntry(sent, 1, (entries) => ({ ...entries }));
      remember(lists, 'feed');
    }

    journaled = commit.undo.length;
  });

  assert.equal(journaled, 2);

  // The next commit journals them again.
  atomically(() => {
    rememberEntry(sent, 1);
    remember(lists, 'feed');
    journaled = commit.undo.length;
  });

  assert.equal(journaled, 2);
});
