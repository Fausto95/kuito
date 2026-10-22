import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { KERNEL_OUTPUT } from '../src/dev/kernel.ts';
import { present } from './support/present.ts';
import { assertKernel } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

const base = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, base), 'utf8');

function createSession() {
  const views = new Map<string, string>();
  let writes = 0;
  const context = hosting({
    createView() {},
    setProp(id: string, name: string, value: unknown) {
      if (name !== 'text') return;

      views.set(id, String(value));
      writes++;
    },
    removeView() {},
  });
  const evaluate = (path: string): unknown =>
    runInNewContext(read(path), context, { filename: path });

  evaluate(KERNEL_OUTPUT);
  assertKernel(context);

  return {
    context,
    views,
    evaluate,
    get writes() {
      return writes;
    },
  };
}

test('successive patch sources keep state and replace handlers and subscriptions', () => {
  const s = createSession();

  s.evaluate('test/fixtures/patches/v1.js');
  assert.equal(s.views.get('counter'), '0');

  const firstSignal = present(s.context.__kuito.state('counter', 'count'), 'count state');

  nativeEvent(s.context.__kuito, 'counter.press');
  assert.equal(firstSignal.value, 1);

  s.evaluate('test/fixtures/patches/v2.js');
  assert.strictEqual(s.context.__kuito.state('counter', 'count'), firstSignal);
  assert.equal(s.views.get('counter'), 'Total: 1');

  const before = s.writes;

  nativeEvent(s.context.__kuito, 'counter.press');
  assert.equal(firstSignal.value, 3);
  assert.equal(s.views.get('counter'), 'Total: 3');
  assert.equal(s.writes, before + 1, 'the old text binding must be unsubscribed');
  assert.equal(firstSignal.listenerCount, 1);
});

test('failed registration leaves the old code and state active', () => {
  const s = createSession();

  s.evaluate('test/fixtures/patches/v1.js');
  assert.throws(() => s.evaluate('test/fixtures/patches/broken.js'), /BROKEN_PATCH/);
  assert.equal(s.context.__kuito.revision('counter'), 1);
  nativeEvent(s.context.__kuito, 'counter.press');
  assert.equal(s.views.get('counter'), '1');
  assert.equal(s.context.__kuito.state('counter', 'count')?.listenerCount, 1);
});

test('a patch that declares a state with another initial keeps it by key', () => {
  const s = createSession();

  s.evaluate('test/fixtures/patches/v1.js');
  nativeEvent(s.context.__kuito, 'counter.press');

  const count = present(s.context.__kuito.state('counter', 'count'), 'count state');

  s.evaluate('test/fixtures/patches/retyped.js');
  assert.equal(s.context.__kuito.revision('counter'), 2);
  assert.strictEqual(s.context.__kuito.state('counter', 'count'), count);
  assert.equal(count.value, 1);
});

test('disposing a module keeps state but removes its handlers and text bindings', () => {
  const s = createSession();

  s.evaluate('test/fixtures/patches/v1.js');

  const signal = present(s.context.__kuito.state('counter', 'count'), 'count state');

  assert.equal(s.context.__kuito.dispose('counter'), true);
  assert.equal(signal.listenerCount, 0);
  nativeEvent(s.context.__kuito, 'counter.press');
  assert.equal(signal.value, 0, 'a press on a disposed view runs no handler');
  s.evaluate('test/fixtures/patches/v2.js');
  assert.strictEqual(s.context.__kuito.state('counter', 'count'), signal);
});

test('kernel rejects duplicate ownership across different modules', () => {
  const s = createSession();

  s.evaluate('test/fixtures/patches/v1.js');

  assert.throws(
    () =>
      s.context.__kuito.patch('other', (api) => {
        api.render(s.context.__kuitoJSX('Button', { id: 'counter', onPress: () => {} }));
      }),
    /owned by another module/,
  );

  assert.equal(s.context.__kuito.revision('other'), 0);
});
