import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { createReporter } from '../src/dev/reporter.ts';
import { present } from './support/present.ts';

function capture() {
  const out: string[] = [];

  return { out, report: createReporter({ out: (line: string) => out.push(line) }) };
}

test('the dev server writes one event object per line', () => {
  const { out, report } = capture();

  report.ready({ url: 'ws://127.0.0.1:8765' });
  report.patched({ revision: 2, ms: 40, files: ['/a.tsx'], initial: false, delivered: 1 });
  report.unchanged({ ms: 20, files: ['/a.tsx'] });

  const phone = { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' };

  report.deviceConnected({ device: phone });
  report.deviceApplied({ device: phone, revision: 2, ms: 9, latency: 150 });
  report.deviceRejected({ device: phone, revision: 3, code: 'EVALUATION', message: 'boom' });
  report.deviceDisconnected({ device: phone });

  assert.deepEqual(
    out.map((line) => JSON.parse(line)),
    [
      { type: 'ready', url: 'ws://127.0.0.1:8765' },
      { type: 'patched', revision: 2, ms: 40, files: ['/a.tsx'], initial: false, delivered: 1 },
      { type: 'unchanged', ms: 20, files: ['/a.tsx'] },
      { type: 'device:connected', device: phone },
      { type: 'device:applied', device: phone, revision: 2, ms: 9, latency: 150 },
      { type: 'device:rejected', device: phone, revision: 3, code: 'EVALUATION', message: 'boom' },
      { type: 'device:disconnected', device: phone },
    ],
  );
});

test('device console entries become events', () => {
  const { out, report } = capture();
  const entry = { level: 'warn', message: 'slow', file: 'demo/app.tsx', line: 3, column: 1 };

  report.console(entry);

  assert.deepEqual(JSON.parse(present(out[0], 'event line')), { type: 'console', ...entry });
});
