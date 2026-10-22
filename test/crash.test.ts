import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatCrash,
  parseLaunchPid,
  summarizeAndroidCrash,
  summarizeCrashReport,
} from '../src/cli/crash.ts';
import { launchAndroid, launchIOS, watchAndroidApp, watchIOSApp } from '../src/cli/platforms.ts';
import { fixtureDevice } from './support/cli.ts';
import { present } from './support/present.ts';

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const fixture = read('ios-no-scene-crash.ips');
const javaCrash = read('android-java-crash.logcat');
const nativeCrash = read('android-native-crash.logcat');

test('crash report summary names the exception and the faulting frames', () => {
  const crash = summarizeCrashReport(fixture);

  assert.equal(crash.pid, 17612);
  assert.equal(crash.process, 'KuitoIOS');
  assert.equal(crash.exception, 'EXC_BREAKPOINT');
  assert.equal(crash.signal, 'SIGTRAP');

  assert.deepEqual(crash.frames[0], {
    image: 'UIKitCore',
    symbol: '___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke',
  });

  assert.ok(crash.frames.some((frame) => frame.image === 'KuitoIOS.debug.dylib'));
});

test('crash summary carries application-specific messages when UIKit provides them', () => {
  const [header, body] = [
    fixture.slice(0, fixture.indexOf('\n')),
    JSON.parse(fixture.slice(fixture.indexOf('\n') + 1)),
  ];

  body.asi = { UIKitCore: ['UIScene lifecycle is required'] };

  assert.deepEqual(summarizeCrashReport(`${header}\n${JSON.stringify(body)}`).messages, [
    'UIScene lifecycle is required',
  ]);
});

test('a crash report without a process name still says what crashed', () => {
  const header = fixture.slice(0, fixture.indexOf('\n'));
  const { procName: _, ...body } = JSON.parse(fixture.slice(fixture.indexOf('\n') + 1));
  const [headline] = formatCrash(summarizeCrashReport(`${header}\n${JSON.stringify(body)}`)).split(
    '\n',
  );

  assert.match(headline, /^The app crashed/);
});

test('unparseable crash report is rejected rather than half-summarized', () => {
  assert.throws(() => summarizeCrashReport('not a report'), /crash report/i);
});

test('formatted crash leads with the cause and points at the full report', () => {
  const text = formatCrash({ ...summarizeCrashReport(fixture), report: '/reports/KuitoIOS.ips' });
  const [headline] = text.split('\n');

  assert.match(headline, /KuitoIOS crashed/);
  assert.match(headline, /EXC_BREAKPOINT/);
  assert.match(text, /UIKitCore\s+___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption/);
  assert.match(text, /\/reports\/KuitoIOS\.ips/);
});

test('simctl launch output yields the app pid', () => {
  assert.equal(parseLaunchPid('dev.kuito.shell: 18244\n'), 18244);
  assert.equal(parseLaunchPid(''), null);
});

test('iOS launch reports the launched pid for crash watching', async () => {
  const runner = {
    async run(_bin: string, args: readonly string[]) {
      return { stdout: args[1] === 'launch' ? 'dev.kuito.shell: 4242\n' : '', stderr: '' };
    },
  };
  const launched = await launchIOS(runner, {
    device: fixtureDevice({ id: 'SIM', name: 'iPhone 18 Pro' }),
    app: '/tmp/KuitoIOS.app',
    appId: 'dev.kuito.shell',
    token: 'T'.repeat(43),
  });

  assert.deepEqual(launched, { label: 'iOS iPhone 18 Pro', pid: 4242 });
});

function reportsWith(pid: number) {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-reports-'));
  const [header, body] = [
    fixture.slice(0, fixture.indexOf('\n')),
    JSON.parse(fixture.slice(fixture.indexOf('\n') + 1)),
  ];

  writeFileSync(
    join(dir, 'KuitoIOS-2026-10-17-013920.ips'),
    `${header}\n${JSON.stringify({ ...body, pid })}`,
  );

  writeFileSync(join(dir, 'Other-2026-10-17-013920.ips'), 'ignored');

  return dir;
}

test('watching a crashed app resolves with the crash report for that pid', async () => {
  let checks = 0;
  const crash = present(
    await watchIOSApp({
      pid: 31337,
      since: 0,
      reportsDir: reportsWith(31337),
      isAlive: () => ++checks < 3,
      pollMs: 1,
      reportWaitMs: 50,
    }),
    'iOS crash',
  );

  assert.equal(crash.exception, 'EXC_BREAKPOINT');
  assert.match(present(crash.report, 'report path'), /KuitoIOS-2026-10-17-013920\.ips$/);
});

test('an app that exits without its own crash report resolves null', async () => {
  const crash = await watchIOSApp({
    pid: 31337,
    since: 0,
    reportsDir: reportsWith(1),
    isAlive: () => false,
    pollMs: 1,
    reportWaitMs: 20,
  });

  assert.equal(crash, null);
});

test('aborting the watch stops polling without reporting', async () => {
  const abort = new AbortController();
  const watching = watchIOSApp({
    pid: 1,
    since: 0,
    reportsDir: tmpdir(),
    isAlive: () => true,
    pollMs: 1,
    signal: abort.signal,
  });

  abort.abort();
  assert.equal(await watching, undefined);
});

test('Android Java crash summary names the exception, its message and the app frames', () => {
  const crash = present(summarizeAndroidCrash(javaCrash, { pid: 890 }), 'Java crash');

  assert.equal(crash.process, 'com.android.settings');
  assert.equal(crash.exception, 'android.app.RemoteServiceException$CrashedByAdbException');
  assert.deepEqual(crash.messages, ['shell-induced crash']);

  assert.deepEqual(crash.frames[0], {
    image: 'ActivityThread.java:2090',
    symbol: 'android.app.ActivityThread.throwRemoteServiceException',
  });
});

test('Android Java crash keeps the Caused by chain, which usually holds the root cause', () => {
  const line = present(
    javaCrash.split('\n').find((l) => l.includes('at android.os.Looper.loop(')),
    'Looper frame',
  );
  const cause = [
    line.replace(
      /AndroidRuntime: .*/,
      'AndroidRuntime: Caused by: java.lang.IllegalStateException: renderer missing',
    ),
    line.replace(
      /AndroidRuntime: .*/,
      'AndroidRuntime: \tat dev.kuito.runtime.KuitoActivity.onCreate(KuitoActivity.kt:42)',
    ),
  ].join('\n');
  const crash = present(
    summarizeAndroidCrash(`${javaCrash.trimEnd()}\n${cause}\n`, { pid: 890 }),
    'Java crash',
  );

  assert.deepEqual(crash.messages, [
    'shell-induced crash',
    'Caused by: java.lang.IllegalStateException: renderer missing',
  ]);
});

test('Android Java crash without a Process line is named after the launched app', () => {
  const withoutProcess = javaCrash
    .split('\n')
    .filter((line) => !line.includes('AndroidRuntime: Process:'))
    .join('\n');
  const crash = present(
    summarizeAndroidCrash(withoutProcess, { pid: 890, process: 'dev.kuito.app' }),
    'Java crash',
  );

  assert.equal(crash.process, 'dev.kuito.app');
  assert.equal(crash.exception, 'android.app.RemoteServiceException$CrashedByAdbException');
  assert.match(formatCrash(crash), /^dev\.kuito\.app crashed/);
});

test('Android native crash summary reads the tombstone signal and backtrace', () => {
  const crash = present(summarizeAndroidCrash(nativeCrash, { pid: 4029 }), 'native crash');

  assert.equal(crash.process, 'com.android.settings');
  assert.equal(crash.exception, 'SIGSEGV');
  assert.equal(crash.signal, 'signal 11');
  assert.deepEqual(crash.frames[0], { image: 'libc.so', symbol: '__epoll_pwait+8' });
});

test('Android crash buffer entries for other processes are ignored', () => {
  assert.equal(summarizeAndroidCrash(`${javaCrash}\n${nativeCrash}`, { pid: 1234 }), null);
});

function adb(responses: Partial<Record<'pidof' | 'logcat' | 'other', string[]>>) {
  const calls: (readonly string[])[] = [];

  return {
    calls,
    async run(_bin: string, args: readonly string[]) {
      calls.push(args);

      const key = args.includes('pidof') ? 'pidof' : args.includes('logcat') ? 'logcat' : 'other';
      const queue = responses[key] ?? [''];

      return { stdout: queue.length > 1 ? present(queue.shift(), key) : queue[0], stderr: '' };
    },
  };
}

test('Android launch reports the launched pid for crash watching', async () => {
  const launched = await launchAndroid(adb({ pidof: ['4029\n'] }), {
    device: fixtureDevice({ id: 'emulator-5554', name: 'Pixel', emulator: true }),
    apk: '/tmp/app.apk',
    appId: 'dev.kuito.shell',
    token: 'T'.repeat(43),
  });

  assert.deepEqual(launched, { label: 'Android Pixel', pid: 4029 });
});

test('watching a crashed Android app resolves with its crash buffer entry', async () => {
  const runner = adb({ pidof: ['4029\n', '4029\n', ''], logcat: ['', nativeCrash] });
  const crash = present(
    await watchAndroidApp({
      runner,
      device: fixtureDevice({ id: 'emulator-5554' }),
      appId: 'dev.kuito.shell',
      pid: 4029,
      pollMs: 1,
      reportWaitMs: 50,
    }),
    'Android crash',
  );

  assert.equal(crash.exception, 'SIGSEGV');
  assert.equal(crash.report, 'adb -s emulator-5554 logcat -b crash -d');
});

test('an Android app replaced by a new process without a crash resolves null', async () => {
  const runner = adb({ pidof: ['5555\n'], logcat: [javaCrash] });

  assert.equal(
    await watchAndroidApp({
      runner,
      device: fixtureDevice({ id: 'emulator-5554' }),
      appId: 'dev.kuito.shell',
      pid: 4029,
      pollMs: 1,
      reportWaitMs: 20,
    }),
    null,
  );
});
