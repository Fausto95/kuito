import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

const views = () => ({ createView() {}, setProp() {}, removeView() {}, moveView() {} });

test('a chunk evaluates on its first require, once, with the chunks it requires', () => {
  const kuito = installKernel(hosting(views())).__kuito;
  const evaluated: string[] = [];

  kuito.resetChunks();

  kuito.defineChunk('shared-ab12', (_require, _module, exports) => {
    evaluated.push('shared');
    exports.answer = 42;
  });

  kuito.defineChunk('route-show', (require, module) => {
    evaluated.push('show');

    const shared = require('./shared-ab12.js') as { answer: number };

    module.exports = { default: shared.answer + 1 };
  });

  assert.deepEqual(evaluated, [], 'defining evaluates nothing');
  assert.deepEqual(kuito.requireChunk('route-show'), { default: 43 });
  assert.equal(kuito.requireChunk('route-show'), kuito.requireChunk('route-show'));
  assert.deepEqual(evaluated, ['show', 'shared']);
});

test('a chunk the app has not defined is loaded from the host, by name', () => {
  const loads: string[] = [];
  const host = installKernel(
    hosting({
      ...views(),
      __kuitoHostLoad(name: string) {
        loads.push(name);
        // What the host's script for the chunk does when it runs.

        host.__kuito.defineChunk(name, (_require, module) => {
          module.exports = { default: 'from ' + name };
        });
      },
    }),
  );

  host.__kuito.resetChunks();

  assert.deepEqual(host.__kuito.requireChunk('route-library'), { default: 'from route-library' });
  host.__kuito.requireChunk('route-library');
  assert.deepEqual(loads, ['route-library'], 'loaded once');
});

test('a chunk nobody defines is an error naming it', () => {
  const kuito = installKernel(hosting({ ...views(), __kuitoHostLoad() {} })).__kuito;

  assert.throws(
    () => kuito.requireChunk('route-gone'),
    /The app has no chunk named route-gone: rebuild the app/,
  );

  const offline = installKernel(hosting(views())).__kuito;

  assert.throws(() => offline.requireChunk('route-gone'), /The app has no chunk named route-gone/);
});

test('a new revision forgets the last one’s chunks: each evaluates again', () => {
  const kuito = installKernel(hosting(views())).__kuito;
  let runs = 0;
  const define = () =>
    kuito.defineChunk('route-index', (_require, module) => {
      module.exports = { run: ++runs };
    });

  kuito.resetChunks();
  define();
  kuito.requireChunk('route-index');
  kuito.resetChunks();
  define();

  assert.deepEqual(kuito.requireChunk('route-index'), { run: 2 });
});
