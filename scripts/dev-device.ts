#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { parseArgs, PLATFORMS, type Platform } from '../src/cli/config.ts';
import { LiveSession } from '../src/dev/session.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import type { Diagnostic } from '../src/dev/compiler.ts';
import { startDevicePatchServer } from '../src/dev/device-server.ts';
import { createReporter } from '../src/dev/reporter.ts';
import { openInEditor } from '../src/dev/editor.ts';
import { browserDeps, openDevtools } from '../src/dev/devtools-browser.ts';
import { saveRecording } from '../src/dev/recordings.ts';

const entry = parseArgs(process.argv[2] ? ['--entry', process.argv[2]] : []).entry;
const port = Number(process.env.KUITO_PORT || 8765);
const platform = PLATFORMS.find((name: Platform) => name === process.env.KUITO_PLATFORM);

// Each platform gets its own bundle, so a session serves one.
if (!platform)
  throw new Error('Set KUITO_PLATFORM to ios or android: the platform whose bundle to serve.');

// Every client sends the session's token; kuito dev hands it to the apps it launches.
const token = process.env.KUITO_DEV_TOKEN ?? '';

if (!token) throw new Error('Set KUITO_DEV_TOKEN: the token every client of this server sends.');

// A paired iPhone reaches the server on its CoreDevice tunnel.
const server = await startDevicePatchServer({
  port,
  token,
  tunnel: process.env.KUITO_PHONE_ADDRESS || undefined,
});
const session = new LiveSession({
  entry,
  compile: createSourceCompiler({ platform, strict: process.env.KUITO_STRICT === '1' }),
  host: server.hub,
});
const report = createReporter();

session.on(
  'patched',
  ({ revision, ms, changed, nativeModules, links, linkHash, assets, initial, delivered }) =>
    report.patched({
      revision,
      ms,
      files: changed,
      entry,
      nativeModules,
      links,
      linkHash,
      assets,
      initial,
      delivered,
    }),
);

session.on('placement', (files) => report.placement({ files }));

session.on('unchanged', ({ ms, changed }) => report.unchanged({ ms, files: changed, entry }));

session.on('rejected', (thrown, { ms, changed }) => {
  const error: Error & { diagnostics?: Diagnostic[] } =
    thrown instanceof Error ? thrown : new Error(String(thrown));

  report.rejected({
    message: error.message,
    diagnostics: error.diagnostics ?? [{ message: error.message.split('\n')[0] }],
    ms,
    files: changed,
    entry,
  });
});

session.on('error', (error) => report.error({ source: 'watcher', message: error.message }));
server.hub.on('console', (entry) => report.console(entry));
session.on('console', (entry) => report.console(entry));

server.hub.on('device', ({ connected, device }) => {
  if (connected && device.platform !== platform)
    report.error({
      source: 'device',
      message: `${device.name} runs ${device.platform}, but this session serves the ${platform} bundle. Start one for ${device.platform}.`,
    });

  if (connected) report.deviceConnected({ device });
  else report.deviceDisconnected({ device });
});

server.hub.on('ack', (ack) => {
  const { device, revision } = ack;

  if (ack.ok)
    report.deviceApplied({ device, revision, ms: ack.ms, latency: session.sinceEdit(revision) });
  else report.deviceRejected({ device, revision, code: ack.code, message: ack.message });
});

server.hub.on('error', (error) => report.error({ source: 'device', message: error.message }));

server.hub.on('open', (location) => {
  Promise.resolve()
    .then(() => openInEditor(location, { root: process.cwd() }))
    .catch((error: Error) => report.error({ source: 'editor', message: error.message }));
});

server.hub.on('recording', ({ device, recording, tree }) => {
  saveRecording({ root: process.cwd(), device, recording, tree })
    .then(({ file, bytes, truncated }) => report.recorded({ device, file, bytes, truncated }))
    .catch((error: Error) => report.error({ source: 'record', message: error.message }));
});

await session.start();
report.ready({ url: `ws://127.0.0.1:${port}` });
report.started({ entry });

const browser = browserDeps(process.cwd());

/** Opens Chrome DevTools on `target` (`js` or `ui`) of the device that connected last. */
async function debug(target: string) {
  const page = server.proxy.latest(target);

  if (!page)
    throw new Error('No Kuito app is connected for debugging. Is a development build running?');

  await openDevtools(page.devtoolsFrontendUrl, browser);
  report.debugger({ title: page.title });
}

/** Opens the Components panel on the JS thread of the device that connected last. */
async function components() {
  const page = server.proxy.latest('js');

  if (!page)
    throw new Error('No Kuito app is connected for debugging. Is a development build running?');

  await openDevtools(
    `http://${server.host}/components/${encodeURIComponent(page.id)}?token=${encodeURIComponent(token)}`,
    browser,
  );

  report.debugger({ title: `Components · ${page.title}` });
}

const reader = createInterface({ input: process.stdin });

for await (const line of reader) {
  const command = line.trim();

  if (command === 'exit' || command === 'quit') break;

  if (command === 'devtools') server.hub.command('devtools');

  if (command === 'record') server.hub.command('record');

  const [verb, target = 'js'] = command.split(/\s+/);

  if (verb === 'components')
    components().catch((error: Error) =>
      report.error({ source: 'devtools', message: error.message }),
    );

  if (verb === 'debug')
    debug(target).catch((error: Error) =>
      report.error({ source: 'devtools', message: error.message }),
    );
}

await session.stop();
await server.close();
