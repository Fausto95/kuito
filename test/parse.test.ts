import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { isAppModule } from '../src/dev/parse.ts';

test('Kuito’s own sources are compiled, from a checkout or installed from npm', () => {
  for (const kuito of ['/work/kuito/', '/work/app/node_modules/kuito/']) {
    assert.ok(isAppModule(`${kuito}src/ui/navigation.tsx`, kuito), kuito);
    assert.ok(isAppModule(`${kuito}native/modules/linking/linking.ts`, kuito), kuito);
    assert.ok(!isAppModule(`${kuito}node_modules/zustand/index.js`, kuito), 'its own dependencies');
  }
});

test('an app’s sources are compiled, other packages left as published', () => {
  const kuito = '/work/app/node_modules/kuito/';

  assert.ok(isAppModule('/work/app/app/index.tsx', kuito));
  assert.ok(!isAppModule('/work/app/node_modules/lodash-es/lodash.js', kuito));
  assert.ok(!isAppModule('/work/app/assets/logo.svg', kuito), 'only script modules');
});
