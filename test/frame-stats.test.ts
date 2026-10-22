import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  launchTimeline,
  median,
  parseGfxinfo,
  traceSections,
  uiFrames,
} from '../scripts/frame-stats.ts';

const gfxinfo = `
Applications Graphics Acceleration Info:
Uptime: 49530187 Realtime: 49530187

** Graphics info for pid 31620 [dev.kuito.shell] **

Stats since: 49311187839ns
Total frames rendered: 240
Janky frames: 60 (25.00%)
Janky frames (legacy): 72 (30.00%)
50th percentile: 13ms
90th percentile: 27ms
95th percentile: 32ms
99th percentile: 57ms
Number Missed Vsync: 12
`;

test('reads frame count, jank and percentiles from dumpsys gfxinfo', () => {
  assert.deepEqual(parseGfxinfo(gfxinfo), {
    frames: 240,
    janky: 60,
    jankPercent: 25,
    p50: 13,
    p90: 27,
    p95: 32,
    p99: 57,
  });
});

test('a gfxinfo dump without frames is an error, not zeros', () => {
  assert.throws(() => parseGfxinfo('** Graphics info for pid 1 [x] **'), /Total frames rendered/);
});

const atrace = `
# tracer: nop
 ev.kuito.shell-100   (  100) [000] ..... 10.000000: tracing_mark_write: B|100|Choreographer#doFrame 1
 ev.kuito.shell-100   (  100) [000] ..... 10.001000: tracing_mark_write: B|100|traversal
 ev.kuito.shell-100   (  100) [000] ..... 10.002000: tracing_mark_write: B|100|Kuito layout
 ev.kuito.shell-100   (  100) [000] ..... 10.006000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 10.008000: tracing_mark_write: E|100
    RenderThread-140   (  100) [000] ..... 10.008500: tracing_mark_write: B|100|DrawFrames 1
 ev.kuito.shell-100   (  100) [000] ..... 10.009000: tracing_mark_write: E|100
    RenderThread-140   (  100) [000] ..... 10.012500: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 10.020000: tracing_mark_write: B|100|Kuito layout
 ev.kuito.shell-100   (  100) [000] ..... 10.021000: tracing_mark_write: E|100
   KuitoHermes-150   (  100) [000] ..... 10.030000: tracing_mark_write: B|100|Kuito layout
   KuitoHermes-150   (  100) [000] ..... 10.040000: tracing_mark_write: E|100
     surfaceflinger-9 (    9) [000] ..... 10.050000: tracing_mark_write: B|9|Kuito layout
     surfaceflinger-9 (    9) [000] ..... 10.060000: tracing_mark_write: E|9
`;

test('sums main-thread trace sections by name, numbered frames merged', () => {
  const sections = traceSections(atrace, 100);

  assert.deepEqual(sections.get('Kuito layout'), { count: 2, totalMs: 5, maxMs: 4 });
  assert.deepEqual(sections.get('traversal'), { count: 1, totalMs: 7, maxMs: 7 });
  assert.deepEqual(sections.get('Choreographer#doFrame'), { count: 1, totalMs: 9, maxMs: 9 });
  assert.equal(sections.has('DrawFrames'), false, 'RenderThread is not the main thread');
});

test('median of repeated runs', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

const frames = `
 ev.kuito.shell-100   (  100) [000] ..... 20.000000: tracing_mark_write: B|100|Choreographer#doFrame 1
 ev.kuito.shell-100   (  100) [000] ..... 20.002000: tracing_mark_write: B|100|draw
 ev.kuito.shell-100   (  100) [000] ..... 20.003000: tracing_mark_write: B|100|postAndWait
 ev.kuito.shell-100   (  100) [000] ..... 20.023000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 20.024000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 20.025000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 20.040000: tracing_mark_write: B|100|Choreographer#doFrame 2
 ev.kuito.shell-100   (  100) [000] ..... 20.041000: tracing_mark_write: B|100|Choreographer#doFrame - resynced to 3 in 20ms
 ev.kuito.shell-100   (  100) [000] ..... 20.041500: tracing_mark_write: B|100|Kuito layout
 ev.kuito.shell-100   (  100) [000] ..... 20.070000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 20.071000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 20.072000: tracing_mark_write: E|100
`;

test('UI-thread frame time leaves out waiting for RenderThread', () => {
  assert.deepEqual(uiFrames(frames, 100), {
    frames: 2,
    slowPercent: 50,
    p50: 5,
    p90: 32,
    maxMs: 32,
    totalMs: 37,
  });
});

const launch = `
           <...>-90    (   90) [000] ..... 29.000000: sched_switch: prev_comm=zygote prev_pid=90 ==> next_comm=init next_pid=1
           <...>-100   (  100) [000] ..... 30.000000: sched_wakeup: comm=ev.kuito.shell pid=100
   KuitoHermes-150   (  100) [000] ..... 30.300000: tracing_mark_write: B|100|Kuito evaluate
   KuitoHermes-150   (  100) [000] ..... 30.340000: tracing_mark_write: E|100
   KuitoHermes-150   (  100) [000] ..... 30.350000: tracing_mark_write: B|100|Kuito evaluate
   KuitoHermes-150   (  100) [000] ..... 30.400000: tracing_mark_write: B|100|Kuito evaluate kuito://modules/route-index
   KuitoHermes-150   (  100) [000] ..... 30.450000: tracing_mark_write: E|100
   KuitoHermes-150   (  100) [000] ..... 30.560000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 30.600000: tracing_mark_write: B|100|Kuito commit 758
 ev.kuito.shell-100   (  100) [000] ..... 30.750000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 31.300000: tracing_mark_write: B|100|Kuito commit 5862
 ev.kuito.shell-100   (  100) [000] ..... 31.500000: tracing_mark_write: B|100|Kuito layout
 ev.kuito.shell-100   (  100) [000] ..... 31.510000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 31.800000: tracing_mark_write: E|100
 ev.kuito.shell-100   (  100) [000] ..... 32.000000: tracing_mark_write: B|100|Kuito commit 23
 ev.kuito.shell-100   (  100) [000] ..... 32.002000: tracing_mark_write: E|100
`;

test('a launch reaches its content when the largest commit ends, timed from the process start', () => {
  assert.deepEqual(launchTimeline(launch, 100), {
    contentMs: 1800,
    evaluates: 2,
    evaluateMs: 250,
    modules: ['kuito://modules/route-index'],
  });
});

test('a launch trace without commits is an error, not a zero', () => {
  assert.throws(() => launchTimeline(atrace, 100), /no Kuito commit/);
});
