#!/usr/bin/env node
/**
 * How long a one-line edit to Reel takes to reach a device, as the CLI
 * measures it: `device:applied`'s latency, from the file's change to the
 * device's ack of the patch (docs/cli.md). Fails when any round takes the
 * budget or longer (benchmarks/README.md, Live Patch).
 *
 *   node scripts/benchmark-live-patch.ts --platform ios --port 18960
 *     [--rounds 20] [--budget 300]
 *
 * Run `kuito dev` in demo/ on `--port` first, with the same KUITO_DEV_TOKEN
 * (43 characters or more) in both environments, then quit it: the shell stays
 * installed and reconnects to this script's server with that token. The
 * edited line is put back when the script ends.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, type Platform } from '../src/cli/config.ts';
import { sessionToken, startLiveServer } from '../src/cli/dev.ts';
import { terminate } from '../src/cli/runner.ts';
import type { SessionEvent } from '../src/cli/session/state.ts';

const { values: options } = parseArgs({
  options: {
    platform: { type: 'string', default: 'ios' },
    port: { type: 'string', default: '8765' },
    rounds: { type: 'string', default: '20' },
    budget: { type: 'string', default: '300' },
  },
});

const platform = options.platform as Platform;
const rounds = Number(options.rounds);
const budget = Number(options.budget);
const file = join(ROOT, 'demo/reel/screens/discover.tsx');
const line = 'The best of TVMaze, live from its API.';
const original = readFileSync(file, 'utf8');

if (!original.includes(line)) throw new Error(`${file} no longer has the line this edits: ${line}`);

const waiting = new Map<string, (event: SessionEvent) => void>();
/** The next `type` event `accept` takes, within `ms`. */
const once = (type: string, ms: number, accept = (_event: SessionEvent) => true) =>
  new Promise<SessionEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${type} within ${ms} ms`)), ms);

    waiting.set(type, (event) => {
      if (!accept(event)) return;
      clearTimeout(timer);
      waiting.delete(type);
      resolve(event);
    });
  });
// The ack for an edit carries its latency; a shell catching up on the current revision may ack without one.
const edited = (event: SessionEvent) =>
  event.type === 'device:applied' && event.latency !== undefined;

if (!process.env.KUITO_DEV_TOKEN)
  throw new Error('Set KUITO_DEV_TOKEN, as for the kuito dev that launched the shell.');

const connected = once('device:connected', 120_000);
const server = await startLiveServer({
  entry: './app',
  port: Number(options.port),
  platform,
  cwd: join(ROOT, 'demo'),
  token: sessionToken(process.env),
  onEvent: (event) => waiting.get(event.type)?.(event),
});
const latencies: number[] = [];

try {
  await connected;

  for (let round = 1; round <= rounds; round++) {
    const applied = once('device:applied', 10_000, edited);

    writeFileSync(file, original.replace(line, `${line.slice(0, -1)} (${round}).`));

    const event = await applied;

    if (event.type !== 'device:applied' || event.latency === undefined)
      throw new Error('The ack carried no latency');

    latencies.push(event.latency);
  }
} finally {
  writeFileSync(file, original);
  await terminate(server);
}

const sorted = [...latencies].sort((a, b) => a - b);
const at = (percent: number) => sorted[Math.max(0, Math.ceil((sorted.length * percent) / 100) - 1)];
const summary = { platform, rounds, p50: at(50), p95: at(95), max: at(100), budget };

console.log(JSON.stringify(summary));

if (summary.max >= budget)
  throw new Error(
    `A one-line edit took ${Math.round(summary.max)} ms to apply; the budget is ${budget} ms.`,
  );
