import { onMount } from 'kuito';
import { assert, render, test, type LogEntry } from 'kuito/tests';

function Legacy() {
  onMount(() => console.warn('Legacy is deprecated: use Modern'));

  return null;
}

const warnings = (logs: readonly LogEntry[]) => logs.filter((entry) => entry.level === 'warn');

test('mounting Legacy warns once', async () => {
  const app = await render(<Legacy />);

  assert.equal(warnings(app.logs).length, 1);
  assert.match(warnings(app.logs)[0]?.message ?? '', /deprecated/);
});
