#!/usr/bin/env node
/**
 * Frame benchmark for the Reel demo on an Android emulator or device. Each
 * scenario replays fixed `adb shell input` gestures on a cold-started app
 * once it is idle, then reads `dumpsys gfxinfo` (jank and percentiles) and
 * an atrace capture of the UI thread. See docs/performance.md.
 *
 *   node scripts/benchmark-android.ts [--device emulator-5554] [--port 8766]
 *     [--runs 3] [--scenario discover] [--build before=a.apk --build after=b.apk]
 *     [--overlays] [--report]
 *
 * Builds alternate within each run, so load on the host drifts into both
 * alike. Without --build, the installed app is measured as `--label`.
 * --report summarizes the traces and results of an earlier run again.
 *
 * Coordinates are for a 1080x2220 screen at 480 dpi (Pixel 3a).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  launchTimeline,
  median,
  parseGfxinfo,
  traceSections,
  uiFrames,
  type FrameStats,
  type LaunchTimeline,
  type UiFrames,
} from './frame-stats.ts';

const APP = 'dev.kuito.shell';
const ACTIVITY = 'dev.kuito.runtime.KuitoActivity';

const { values: options } = parseArgs({
  options: {
    device: { type: 'string', default: 'emulator-5554' },
    port: { type: 'string', default: '8766' },
    runs: { type: 'string', default: '3' },
    label: { type: 'string', default: 'run' },
    scenario: { type: 'string', multiple: true },
    build: { type: 'string', multiple: true },
    overlays: { type: 'boolean', default: false },
    report: { type: 'boolean', default: false },
  },
});

type Step =
  | { tap: [number, number] }
  | { swipe: [number, number, number, number, number] }
  | { wait: number };

const tabs = {
  discover: [189, 2065],
  search: [415, 2065],
  library: [736, 2065],
  lab: [1009, 2065],
};
const tab = (name: keyof typeof tabs): Step[] => [
  { tap: tabs[name] as [number, number] },
  { wait: 900 },
];
const up: Step = { swipe: [540, 1700, 540, 500, 250] };
const down: Step = { swipe: [540, 500, 540, 1700, 250] };
const railLeft = (y: number): Step => ({ swipe: [950, y, 150, y, 250] });
const settle: Step = { wait: 700 };
const repeat = (times: number, steps: Step[]) => Array.from({ length: times }, () => steps).flat();

/**
 * In this order, each scenario starts on Discover with the app idle; only
 * the sheet needs Discover scrolled to the top. Discover scrolls back up by
 * as many swipes as it went down: one more would pull to refresh.
 */
const scenarios: Record<string, Step[]> = {
  sheet: repeat(2, [
    { tap: [233, 1238] },
    { wait: 1200 },
    { swipe: [540, 640, 540, 2150, 200] },
    { wait: 1200 },
  ]),
  tabs: repeat(2, [...tab('search'), ...tab('library'), ...tab('lab'), ...tab('discover')]),
  discover: [
    railLeft(1800),
    settle,
    railLeft(1800),
    settle,
    ...repeat(4, [up, settle, railLeft(1100), settle]),
    ...repeat(4, [down, settle]),
  ],
  library: [
    ...tab('library'),
    ...repeat(6, [up, settle]),
    ...repeat(6, [down, settle]),
    ...tab('discover'),
  ],
};

function adb(...args: string[]) {
  return adbWithInput(undefined, ...args);
}

function adbWithInput(input: string | undefined, ...args: string[]) {
  const result = spawnSync('adb', ['-s', options.device, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 256 << 20,
  });

  if (result.status !== 0)
    throw Error(`adb ${args.join(' ')} failed: ${result.stderr || result.error?.message}`);

  return result.stdout;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One on-device script, so host round trips do not stretch the waits. */
function play(steps: Step[]) {
  const commands = steps.map((step) =>
    'tap' in step
      ? `input tap ${step.tap.join(' ')}`
      : 'swipe' in step
        ? `input swipe ${step.swipe.join(' ')}`
        : `sleep ${step.wait / 1000}`,
  );

  adb('shell', commands.join(' && '));
}

/** A cold start through the dev server, in ms until the activity first drew (`am start -W`). */
function launch() {
  adb('shell', 'am', 'force-stop', APP);
  writePreferences(overlayPreferences(options.overlays));

  const output = adb(
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${APP}/${ACTIVITY}`,
    '--es',
    'kuito_dev_url',
    `ws://10.0.2.2:${options.port}`,
  );
  const total = /TotalTime: (\d+)/.exec(output)?.[1];

  if (!total) throw Error(`The app did not start:\n${output}`);

  return Number(total);
}

const preferences = 'shared_prefs/kuito.devtools.xml';

/**
 * The devtools' FPS monitor and update highlighter redraw the window on
 * their own, so they stay off unless --overlays measures them. The app
 * reads them at launch; the user's own settings come back at the end.
 */
function readPreferences() {
  const result = spawnSync(
    'adb',
    ['-s', options.device, 'shell', 'run-as', APP, 'cat', preferences],
    {
      encoding: 'utf8',
    },
  );

  return result.status === 0 ? result.stdout : undefined;
}

function writePreferences(xml: string) {
  adbWithInput(xml, 'shell', 'run-as', APP, 'sh', '-c', `'cat > ${preferences}'`);
}

function overlayPreferences(on: boolean) {
  return [
    "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>",
    '<map>',
    `    <boolean name="performance" value="${on}" />`,
    `    <boolean name="highlights" value="${on}" />`,
    '</map>',
    '',
  ].join('\n');
}

/** The app's CPU time in clock ticks (10 ms), all threads. */
function cpuTicks() {
  const fields = adb('shell', 'cat', `/proc/${pid()}/stat`).split(') ')[1]?.split(' ') ?? [];

  // utime and stime: fields 14 and 15 of stat, counted after the command name.
  return Number(fields[11]) + Number(fields[12]);
}

/**
 * Waits until the app spends under a tenth of a core for two seconds: the
 * catalog, posters and layout have landed. A fixed wait is not enough on a
 * one-core emulator, where the first content takes from seconds to minutes.
 */
async function idle(deadlineMs = 120_000) {
  const deadline = Date.now() + deadlineMs;
  let last = cpuTicks();
  let quiet = 0;

  while (quiet < 2) {
    if (Date.now() > deadline) throw Error(`${APP} stayed busy for ${deadlineMs / 1000}s`);

    await sleep(1000);

    const now = cpuTicks();

    quiet = now - last <= 10 ? quiet + 1 : 0;
    last = now;
  }
}

function pid() {
  const value = Number(adb('shell', 'pidof', APP).trim());

  if (!value) throw Error(`${APP} is not running`);

  return value;
}

// Not `input`: InputDispatcher's own sections overflow the buffer within
// seconds. The app's input handling is traced under `view`.
const categories = ['gfx', 'view', 'sched'];

interface Measured {
  stats: FrameStats & { anrs: number; startMs?: number };
  ui: UiFrames;
  sections: Record<string, unknown>;
  launch?: LaunchTimeline;
}

function analyze(trace: string, pid: number) {
  const sections = Object.fromEntries(
    [...traceSections(trace, pid)].sort(([, a], [, b]) => b.totalMs - a.totalMs).slice(0, 40),
  );

  return { ui: uiFrames(trace, pid), sections };
}

/** The app's process in a trace: only Kuito emits `Kuito …` sections. */
function tracedPid(trace: string) {
  const match = /tracing_mark_write: B\|(\d+)\|Kuito /.exec(trace);

  if (!match?.[1]) throw Error('The trace has no Kuito sections');

  return Number(match[1]);
}

/** Traces and counts frames over `play`, which drives the app. */
async function measure(file: string, play: () => Promise<void>): Promise<Measured> {
  adb('logcat', '-c');
  adb('shell', 'atrace', '--async_start', '-b', '65536', '-a', APP, ...categories);
  adb('shell', 'dumpsys', 'gfxinfo', APP, 'reset');
  await play();

  const trace = adb('shell', 'atrace', '--async_stop');
  const anrs = adb('logcat', '-d', '-s', 'ActivityManager').split(`ANR in ${APP}`).length - 1;
  const stats = { ...parseGfxinfo(adb('shell', 'dumpsys', 'gfxinfo', APP)), anrs };

  writeFileSync(`${file}.atrace.txt`, trace);

  return { stats, ...analyze(trace, pid()) };
}

/**
 * `launch` traces the cold start until the app is idle; gfxinfo counts the
 * frames from the first draw on (the process does not exist before).
 */
async function measureLaunch(file: string): Promise<Measured> {
  adb('logcat', '-c');
  adb('shell', 'atrace', '--async_start', '-b', '65536', '-a', APP, ...categories);

  const startMs = launch();

  adb('shell', 'dumpsys', 'gfxinfo', APP, 'reset');
  await idle();

  const trace = adb('shell', 'atrace', '--async_stop');
  const anrs = adb('logcat', '-d', '-s', 'ActivityManager').split(`ANR in ${APP}`).length - 1;
  const stats = { ...parseGfxinfo(adb('shell', 'dumpsys', 'gfxinfo', APP)), anrs, startMs };

  writeFileSync(`${file}.atrace.txt`, trace);

  const app = pid();

  return { stats, ...analyze(trace, app), launch: launchTimeline(trace, app) };
}

const known = ['launch', ...Object.keys(scenarios)];
const selected = options.scenario?.length ? options.scenario : known;
const builds = (options.build ?? [`${options.label}=`]).map((entry) => {
  const [label = '', apk = ''] = entry.split('=');

  return { label, apk };
});

for (const name of selected)
  if (!known.includes(name)) throw Error(`Unknown scenario ${name}; known: ${known.join(', ')}`);

const results = new Map<string, Map<string, Measured[]>>();
const userPreferences = options.report ? undefined : readPreferences();

// Stopped with Ctrl-C or kill, the run still gives the user's settings back.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    if (userPreferences) writePreferences(userPreferences);
    process.exit(130);
  });

if (!options.report) {
  // A sleeping or locked screen starts the activity without drawing it.
  adb('shell', 'svc', 'power', 'stayon', 'true');
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'wm', 'dismiss-keyguard');
}

if (options.report) {
  for (const { label } of builds) {
    const directory = join('dist', 'benchmarks', 'android', label);
    const saved = JSON.parse(readFileSync(join(directory, 'results.json'), 'utf8')) as {
      runs: Record<string, Measured[]>;
    };

    results.set(
      label,
      new Map(
        Object.entries(saved.runs).map(([name, measured]) => [
          name,
          measured.map((item, index) => {
            const trace = readFileSync(join(directory, `${name}-${index + 1}.atrace.txt`), 'utf8');

            const app = tracedPid(trace);

            return {
              ...item,
              ...analyze(trace, app),
              ...(name === 'launch' ? { launch: launchTimeline(trace, app) } : {}),
            };
          }),
        ]),
      ),
    );
  }
}

for (let run = 1; run <= (options.report ? 0 : Number(options.runs)); run++) {
  for (const { label, apk } of builds) {
    const directory = join('dist', 'benchmarks', 'android', label);
    const byScenario = results.get(label) ?? new Map<string, Measured[]>();

    results.set(label, byScenario);
    mkdirSync(directory, { recursive: true });

    try {
      if (apk) {
        adb('install', '-r', apk);
        // The first start after an install also compiles and verifies code.
        launch();
        await idle();
      }

      if (!selected.includes('launch')) {
        launch();
        await idle();
      }

      for (const name of known.filter((item) => selected.includes(item))) {
        const file = join(directory, `${name}-${run}`);
        const steps = scenarios[name];

        const result = steps
          ? await idle().then(() => measure(file, async () => play(steps)))
          : await measureLaunch(file);

        byScenario.set(name, [...(byScenario.get(name) ?? []), result]);

        console.log(
          `${label} ${name} #${run}`,
          JSON.stringify({ ...result.stats, ...result.launch }),
        );
      }
    } catch (error) {
      // An ANR the system resolved by killing the app: the rest of this run is lost.
      console.error(`${label} run ${run} failed: ${String(error)}`);
    }
  }
}

if (userPreferences) writePreferences(userPreferences);

for (const [label, byScenario] of results) {
  const summary = Object.fromEntries(
    [...byScenario].map(([name, measured]) => {
      const stats = measured.map((item) => item.stats);
      const ui = measured.map((item) => item.ui);
      const launches = measured.flatMap((item) => (item.launch ? [item.launch] : []));

      return [
        name,
        {
          runs: stats.length,
          frames: median(stats.map((s) => s.frames)),
          jankPercent: median(stats.map((s) => s.jankPercent)),
          p50: median(stats.map((s) => s.p50)),
          p90: median(stats.map((s) => s.p90)),
          p99: median(stats.map((s) => s.p99)),
          anrs: stats.reduce((sum, s) => sum + s.anrs, 0),
          uiSlowPercent: median(ui.map((u) => u.slowPercent)),
          uiP90: median(ui.map((u) => u.p90)),
          uiMaxMs: median(ui.map((u) => u.maxMs)),
          uiTotalMs: median(ui.map((u) => u.totalMs)),
          ...(name === 'launch'
            ? {
                startMs: median(stats.map((s) => s.startMs ?? 0)),
                contentMs: median(launches.map((l) => l.contentMs)),
                evaluateMs: median(launches.map((l) => l.evaluateMs)),
              }
            : {}),
        },
      ];
    }),
  );
  const directory = join('dist', 'benchmarks', 'android', label);

  writeFileSync(
    join(directory, 'results.json'),
    JSON.stringify({ summary, runs: Object.fromEntries(byScenario) }, null, 2),
  );

  console.log(label);
  console.table(summary);
}
