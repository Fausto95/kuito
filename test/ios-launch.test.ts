import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { iosLaunchTimeline } from '../scripts/ios-launch.ts';

const event = (timestamp: string, fields: Record<string, string>) =>
  JSON.stringify({ timestamp, processImagePath: '/KuitoIOS.app/KuitoIOS', ...fields });
const signpost = (timestamp: string, name: string, type: string, message = '') =>
  event(timestamp, {
    eventType: 'signpostEvent',
    subsystem: 'dev.kuito.shell',
    signpostName: name,
    signpostType: type,
    eventMessage: message,
  });

// `log stream --style ndjson` output: a banner line, then one event per line.
const stream = [
  'Filtering the log data using "process == "KuitoIOS""',
  event('2026-10-18 17:06:01.500000+0200', { eventType: 'logEvent', subsystem: 'com.apple.UIKit' }),
  signpost('2026-10-18 17:06:02.000000+0200', 'Kuito evaluate', 'begin'),
  signpost('2026-10-18 17:06:02.010000+0200', 'Kuito evaluate', 'end'),
  signpost('2026-10-18 17:06:02.100000+0200', 'Kuito evaluate', 'begin'),
  // A route module the app's script loaded while it ran.
  signpost(
    '2026-10-18 17:06:02.150000+0200',
    'Kuito evaluate',
    'begin',
    'kuito://modules/route-index',
  ),
  signpost('2026-10-18 17:06:02.200000+0200', 'Kuito evaluate', 'end'),
  signpost('2026-10-18 17:06:02.300000+0200', 'Kuito evaluate', 'end'),
  signpost('2026-10-18 17:06:02.400000+0200', 'Kuito commit', 'begin', '700'),
  signpost('2026-10-18 17:06:02.500000+0200', 'Kuito commit', 'end', '700'),
  signpost('2026-10-18 17:06:03.000000+0200', 'Kuito commit', 'begin', '45'),
  signpost('2026-10-18 17:06:03.100000+0200', 'Kuito commit', 'end', '45'),
].join('\n');

test('an iOS launch reaches its content when the largest commit ends, timed from the process start', () => {
  assert.deepEqual(iosLaunchTimeline(stream), {
    contentMs: 1000,
    evaluates: 2,
    evaluateMs: 210,
    modules: ['kuito://modules/route-index'],
  });
});

test('an iOS launch log without commits is an error, not a zero', () => {
  const quiet = stream
    .split('\n')
    .filter((line) => !line.includes('Kuito commit'))
    .join('\n');

  assert.throws(() => iosLaunchTimeline(quiet), /no Kuito commit/);
});
