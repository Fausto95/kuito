import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { ROOT, type Platform } from '../src/cli/config.ts';
import { buildDeviceAssets } from '../src/cli/device-assets.ts';
import { discover, resolveDevice, runAdb, type Device } from '../src/cli/devices.ts';
import { shellModules } from '../src/cli/modules.ts';
import {
  buildAndroid,
  buildIOS,
  ensureAndroidBooted,
  ensureIOSBooted,
  launchAndroid,
  launchIOS,
} from '../src/cli/platforms.ts';
import { encodePng, solid } from '../src/cli/png.ts';
import { loadProject } from '../src/cli/project.ts';
import { createRunner, type Runner } from '../src/cli/runner.ts';

// Builds a shell around a fixture app (test/fixtures/shell-smoke-app.tsx,
// persisted-launches-app.tsx) and runs it, offline from its bundled scripts,
// on the device each variable names (a simulator, an AVD or an adb serial).
// Without one, the platform's tests are skipped:
//
//   KUITO_SMOKE_IOS="iPhone 18 Pro" KUITO_SMOKE_ANDROID=emulator-5554 \
//     npx vp test run test/shell-smoke.test.ts
//
// .github/workflows/mobile-shells.yml runs it on both platforms.
const DEVICES: Record<Platform, string | undefined> = {
  ios: process.env.KUITO_SMOKE_IOS,
  android: process.env.KUITO_SMOKE_ANDROID,
};

// The app fetches from this port (SERVER in the fixture).
const PORT = 18990;
// Where the shell looks for a dev server: nothing listens, so it runs its bundle.
const NO_DEV_SERVER = 18991;
const APP_ID = 'dev.kuito.smoke';
const PNG = encodePng(solid(48, 32, [12, 140, 233]));

/** A project of its own, so the smoke app installs beside the demo instead of over it. */
async function smokeProject() {
  const root = join(ROOT, '.kuito/shell-smoke');

  mkdirSync(root, { recursive: true });

  writeFileSync(
    join(root, 'kuito.config.ts'),
    `export default ${JSON.stringify({
      name: 'Kuito Smoke',
      ios: { bundleIdentifier: APP_ID },
      android: { applicationId: APP_ID },
      permissions: {},
    })};\n`,
  );

  return loadProject(root, 'development');
}

/** Serves the PNG, and hands out the reports the app posts back in the order they come. */
function smokeServer() {
  const reports: string[] = [];
  const waiting: ((report: string) => void)[] = [];
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/smoke.png')
      return void response.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG);

    if (request.method !== 'POST' || request.url !== '/report')
      return void response.writeHead(404).end();

    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));

    request.on('end', () => {
      response.writeHead(204).end();

      const take = waiting.shift();

      if (take) take(body);
      else reports.push(body);
    });
  });
  /** The next report the app posts. */
  const next = () => {
    const report = reports.shift();

    return report === undefined
      ? new Promise<string>((resolve) => waiting.push(resolve))
      : Promise.resolve(report);
  };

  return new Promise<{ server: typeof server; next: () => Promise<string> }>((ready) =>
    server.listen(PORT, () => ready({ server, next })),
  );
}

/** `report`, or a failure naming what never came within `milliseconds`. */
function within<T>(report: Promise<T>, milliseconds: number, what: string) {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error(`No ${what} within ${milliseconds} ms`)), milliseconds);
  });

  return Promise.race([report, late]).finally(() => clearTimeout(timer));
}

const STEPS = {
  ios: {
    boot: ensureIOSBooted,
    build: buildIOS,
    launch: (runner: Runner, device: Device, artifact: string) =>
      launchIOS(runner, {
        device,
        app: artifact,
        appId: APP_ID,
        port: NO_DEV_SERVER,
        token: 'T'.repeat(43),
      }),
    kill: (runner: Runner, device: Device) =>
      runner.run('xcrun', ['simctl', 'terminate', device.id, APP_ID]),
  },
  android: {
    boot: ensureAndroidBooted,
    build: buildAndroid,
    launch: (runner: Runner, device: Device, artifact: string) =>
      launchAndroid(runner, {
        device,
        apk: artifact,
        appId: APP_ID,
        port: NO_DEV_SERVER,
        token: 'T'.repeat(43),
      }),
    kill: (runner: Runner, device: Device) =>
      runAdb(runner, ['-s', device.id, 'shell', 'am', 'force-stop', APP_ID]),
  },
};

/** The device `query` names, booted, and a shell built around the fixture `entry`. */
async function shellFor(platform: Platform, query: string, entry: string) {
  const runner = createRunner();
  const steps = STEPS[platform];
  const { devices } = await discover(runner, { platform });
  const device = await steps.boot(runner, resolveDevice(devices, query));
  const project = await smokeProject();
  const compiled = await buildDeviceAssets(join(ROOT, 'test/fixtures', entry), project, platform);
  const artifact = await steps.build(runner, {
    project,
    ...(await shellModules(project.root, {
      uses: compiled.nativeModules,
      links: compiled.links,
      linkHash: compiled.linkHash,
    })),
    assets: compiled.assets,
    device,
  });

  return {
    device,
    launch: () => steps.launch(runner, device, artifact),
    kill: () => steps.kill(runner, device),
  };
}

for (const platform of ['ios', 'android'] as const) {
  const query = DEVICES[platform];

  test.skipIf(!query)(
    `fetches a PNG as an ArrayBuffer and formats with Intl in the ${platform} shell`,
    async ({ onTestFinished }) => {
      const { device, launch } = await shellFor(platform, query ?? '', 'shell-smoke-app.tsx');
      const { server, next } = await smokeServer();

      onTestFinished(() => void server.close());
      await launch();

      const { png, intl } = JSON.parse(
        await within(next(), 90_000, `report from the ${platform} shell`),
      ) as { png: unknown; intl: Record<string, unknown> };

      console.log(`${platform} ${device.name}: ${JSON.stringify({ png, intl }, null, 2)}`);

      assert.deepEqual(png, {
        status: 200,
        type: 'image/png',
        length: PNG.byteLength,
        sum: PNG.reduce((sum, byte) => (sum + byte) % 65521, 0),
      });

      assert.deepEqual(
        {
          number: intl.number,
          currency: intl.currency,
          percent: intl.percent,
          date: intl.date,
          collator: intl.collator,
          localeString: intl.localeString,
        },
        {
          number: '1.234,5',
          currency: '€1,234.50',
          percent: '25%',
          date: '1/1/1970',
          collator: -1,
          localeString: '1,234.5',
        },
      );
    },
    30 * 60_000,
  );

  test.skipIf(!query)(
    `a persisted signal keeps its value when the ${platform} shell is killed and launched again`,
    async ({ onTestFinished }) => {
      const shell = await shellFor(platform, query ?? '', 'persisted-launches-app.tsx');
      const { server, next } = await smokeServer();

      onTestFinished(() => void server.close());

      const launched = async () => {
        await shell.launch();

        return JSON.parse(await within(next(), 90_000, `report from the ${platform} shell`)) as {
          before: number;
          stored: string | null;
        };
      };

      const first = await launched();

      assert.equal(first.stored, String(first.before + 1), 'the launch stored its count');

      // As the system or a swipe away does: the process ends, nothing is flushed.
      await shell.kill();

      const second = await launched();

      assert.equal(second.before, first.before + 1, 'the next launch read it back');
    },
    30 * 60_000,
  );
}
