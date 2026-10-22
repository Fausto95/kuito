import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { loadModules } from '../src/cli/modules.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { present } from './support/present.ts';
import { flushed, installKernel, type Props } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';

// Camera as an app renders and drives it through its ref, against a fake
// platform that describes the Camera module the way iOS and Android do.

type Method = (...args: unknown[]) => Promise<unknown>;

interface App {
  camera: {
    current: (Record<string, Method> & { id: string }) | null;
    readonly ready: { readonly value: boolean };
    readonly error: { readonly value: { code: string; message: string } | null };
  };
  events: unknown[];
  flip(): void;
  toggle(): void;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const tick = () => new Promise<void>((done) => setTimeout(done, 0));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-camera-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/camera-app.tsx');

const picture = { uri: 'file:///cache/Camera/1.jpg', width: 4032, height: 3024 };
const video = { uri: 'file:///cache/Camera/2.mp4', duration: 3.5 };

const VIEW_FUNCTIONS = [
  'takePicture',
  'startRecording',
  'stopRecording',
  'pausePreview',
  'resumePreview',
];

function cameraModule(): FakeModule {
  const answers: Record<string, unknown> = {
    takePicture: picture,
    startRecording: video,
    stopRecording: video,
    pausePreview: null,
    resumePreview: null,
  };

  return {
    functions: Object.fromEntries(
      VIEW_FUNCTIONS.map((name) => [name, { thread: 'main' as const, run: () => answers[name] }]),
    ),
    // The spec's view methods are linked functions: the fake answers each by name.
    view: { events: ['ready', 'error', 'barcode'] },
  };
}

async function launch() {
  const native = fakeModules({ Camera: cameraModule() });
  const views = new Map<string, { kind: string; props: Props }>();
  /** Every prop the host received, as `<id>.<name>`. */
  const sent: string[] = [];
  const kernel = installKernel(
    hosting({
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
        sent.push(`${id}.${name}`);
      },
      removeView(id: string) {
        views.delete(id);
      },
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  const app = kernel as unknown as App;
  const flush = async () => {
    await tick();
    native.flush();
    await tick();
  };

  return {
    ...native,
    app,
    views,
    sent,
    kernel,
    flush,
    id: (label: string) => handleOf(kernel.__kuito, label),
  };
}

test('Camera renders the Camera module view with its props', async () => {
  const { views, loads } = await launch();
  const view = present(views.get('camera'), 'camera view');

  assert.equal(view.kind, 'module:Camera');

  assert.deepEqual(view.props, {
    flex: 1,
    facing: 'back',
    flash: 'auto',
    torch: false,
    zoom: 0.25,
    mode: 'video',
    barcodes: ['qr', 'ean13'],
  });

  assert.deepEqual(loads, ['Camera']);
});

test('switching the facing updates only that prop', async () => {
  const { app, views, sent } = await launch();

  sent.length = 0;
  app.flip();
  await flushed();

  assert.equal(present(views.get('camera'), 'camera view').props.facing, 'front');
  assert.deepEqual(sent, ['camera.facing']);
});

test('onReady, onError and onBarcode receive the native events', async () => {
  const { app, kernel } = await launch();

  assert.equal(app.camera.ready.value, false);
  nativeEvent(kernel.__kuito, 'camera.ready');
  assert.equal(app.camera.ready.value, true, 'its ref holds whether it is ready');

  nativeEvent(
    kernel.__kuito,
    'camera.error\u001f{"code":"ERR_PERMISSION","message":"Camera access is denied"}',
  );

  assert.equal(app.camera.ready.value, false);
  assert.equal(app.camera.error.value?.code, 'ERR_PERMISSION');

  nativeEvent(
    kernel.__kuito,
    'camera.barcode\u001f{"format":"qr","data":"https://kuito.dev","bounds":{"x":0,"y":0,"width":10,"height":10}}',
  );

  assert.deepEqual(data(app.events), [
    ['ready'],
    ['error', 'ERR_PERMISSION', 'Camera access is denied'],
    ['barcode', 'qr', 'https://kuito.dev'],
  ]);
});

test('takePicture is called on the mounted camera and resolves the picture', async () => {
  const { app, queued, flush, id } = await launch();
  const camera = present(app.camera.current, 'camera ref');
  const taken = camera.takePicture({ quality: 0.7, bytes: false });

  await flush();

  assert.deepEqual(data(queued), [
    {
      module: 'Camera',
      method: 'takePicture',
      args: [id('camera'), { quality: 0.7, bytes: false }],
    },
  ]);

  assert.deepEqual(data(await taken), picture);
});

test('recording starts and stops on the camera, and both resolve the video', async () => {
  const { app, queued, flush, id } = await launch();
  const camera = present(app.camera.current, 'camera ref');
  const recording = camera.startRecording();
  const stopped = camera.stopRecording();

  await flush();

  assert.deepEqual(
    queued.map(({ method, args }) => [method, data(args)]),
    [
      // An optional argument left out crosses as null.
      ['startRecording', [id('camera'), null]],
      ['stopRecording', [id('camera')]],
    ],
  );

  assert.deepEqual(data(await recording), video);
  assert.deepEqual(data(await stopped), video);
});

test('the preview pauses and resumes through the ref', async () => {
  const { app, queued, flush } = await launch();
  const camera = present(app.camera.current, 'camera ref');

  await Promise.all([camera.pausePreview(), camera.resumePreview(), flush()]);

  assert.deepEqual(
    queued.map(({ method }) => method),
    ['pausePreview', 'resumePreview'],
  );
});

test('unmounting the camera removes its view and empties its ref', async () => {
  const { app, views, queued } = await launch();
  const camera = present(app.camera.current, 'camera ref');

  app.toggle();
  await tick();

  assert.equal(views.has('camera'), false);
  assert.equal(app.camera.current, null);

  await assert.rejects(camera.takePicture(), /Camera\.takePicture: the view camera is not mounted/);

  assert.deepEqual(queued, []);
});

test('the Camera module declares what it needs on each platform', async () => {
  const app = mkdtempSync(join(tmpdir(), 'kuito-camera-'));
  const camera = (await loadModules(app).finally(() => rmSync(app, { recursive: true }))).find(
    ({ manifest }) => manifest.name === 'Camera',
  )?.manifest;

  assert.deepEqual(camera?.requires, ['Permissions']);
  assert.equal(typeof camera?.ios?.infoPlist.NSCameraUsageDescription, 'string');
  assert.equal(typeof camera?.ios?.infoPlist.NSMicrophoneUsageDescription, 'string');

  assert.deepEqual(camera?.android?.permissions, [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
  ]);

  // The bundled ML Kit model scans without Google Play Services (docs/camera.md#barcodes).
  assert.ok(camera?.android?.dependencies.includes('com.google.mlkit:barcode-scanning:17.3.0'));

  assert.deepEqual(camera?.android?.features, [
    { name: 'android.hardware.camera.any', required: false },
    { name: 'android.hardware.microphone', required: false },
  ]);
});
