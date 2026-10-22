// Real, unmodified npm source; transformed/bundled by Rolldown.
import groupBy from 'lodash-es/groupBy.js';

const grouped = groupBy(
  [
    { name: 'Ada', team: 'compiler' },
    { name: 'Lin', team: 'runtime' },
    { name: 'Grace', team: 'compiler' },
  ],
  'team',
);

if (grouped.compiler.length !== 2 || grouped.runtime.length !== 1) {
  throw new Error('KUITO_NPM_PROBE_FAIL');
}

console.log('KUITO_NPM_PROBE_PASS');
