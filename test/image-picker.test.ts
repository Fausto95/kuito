import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { loadModules } from '../src/cli/modules.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// mediaPicker as an app calls it, against a fake platform that answers like
// the iOS and Android modules: one request per call with every option filled
// in, and the picked assets back, or none when the user cancels.

type Asset = Record<string, unknown>;
type Result = { canceled: boolean; assets: Asset[] | null };

interface Apis {
  mediaPicker: {
    pick(options?: Record<string, unknown>): Promise<Result>;
    capture(options?: Record<string, unknown>): Promise<Result>;
  };
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-image-picker-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/image-picker-app.tsx');

const photo: Asset = {
  uri: 'file:///cache/ImagePicker/1.jpg',
  width: 4032,
  height: 3024,
  type: 'image',
  mimeType: 'image/jpeg',
  fileName: 'IMG_0001.jpg',
  fileSize: 2_481_920,
};

const clip: Asset = {
  uri: 'file:///cache/ImagePicker/2.mp4',
  width: 1920,
  height: 1080,
  type: 'video',
  mimeType: 'video/mp4',
  fileName: 'clip.mp4',
  fileSize: 9_000_000,
  duration: 4200,
};

/** A platform whose picker answers `picked`, or throws it as `{ code, message }`. */
function platform(picked: () => Asset[]): Record<string, FakeModule> {
  return {
    ImagePicker: {
      functions: {
        launchImageLibrary: { thread: 'main', run: () => picked() },
        launchCamera: { thread: 'main', run: () => picked() },
      },
    },
  };
}

async function apis(picked: () => Asset[] = () => [photo]) {
  const native = fakeModules(platform(picked));
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await new Promise<void>((done) => setTimeout(done, 0));
  };

  return { ...native, mediaPicker: (kernel as never as Apis).mediaPicker, flush };
}

const defaults = {
  mediaTypes: ['images'],
  selectionLimit: 1,
  quality: 1,
  maxWidth: null,
  maxHeight: null,
  allowsEditing: false,
};

test('pick sends every option filled in, and resolves the picked assets', async () => {
  const app = await apis(() => [photo, clip]);
  const plain = app.mediaPicker.pick();
  const chosen = app.mediaPicker.pick({
    mediaTypes: ['images', 'videos'],
    selectionLimit: 0,
    quality: 0.5,
    maxWidth: 1024,
  });

  await app.flush();

  assert.deepEqual(data(await plain), { canceled: false, assets: [photo, clip] });
  await chosen;

  assert.deepEqual(data(app.calls), [
    { module: 'ImagePicker', method: 'launchImageLibrary', args: [defaults] },
    {
      module: 'ImagePicker',
      method: 'launchImageLibrary',
      args: [
        {
          ...defaults,
          mediaTypes: ['images', 'videos'],
          selectionLimit: 0,
          quality: 0.5,
          maxWidth: 1024,
        },
      ],
    },
  ]);
});

test('mediaTypes takes one type or a list of them', async () => {
  const app = await apis();
  const picked = app.mediaPicker.pick({ mediaTypes: 'videos' });

  await app.flush();
  await picked;

  assert.deepEqual(data(app.calls[0].args), [{ ...defaults, mediaTypes: ['videos'] }]);
});

test('closing the picker without a pick is canceled, with no assets', async () => {
  const app = await apis(() => []);
  const library = app.mediaPicker.pick();
  const camera = app.mediaPicker.capture();

  await app.flush();

  assert.deepEqual(data(await library), { canceled: true, assets: null });
  assert.deepEqual(data(await camera), { canceled: true, assets: null });
});

test('capture takes one asset with the same options', async () => {
  const app = await apis();
  const captured = app.mediaPicker.capture({ quality: 0.8, allowsEditing: true });

  await app.flush();

  assert.deepEqual(data(await captured), { canceled: false, assets: [photo] });

  assert.deepEqual(data(app.calls), [
    {
      module: 'ImagePicker',
      method: 'launchCamera',
      args: [{ ...defaults, quality: 0.8, allowsEditing: true }],
    },
  ]);
});

test('a denied camera rejects with the platform’s code', async () => {
  const app = await apis(() => {
    throw { code: 'ERR_PERMISSION', message: 'The camera permission was denied' };
  });
  const rejected = assert.rejects(app.mediaPicker.capture(), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'ERR_PERMISSION');
    assert.match(error.message, /ImagePicker\.launchCamera.*camera permission was denied/);

    return true;
  });

  await app.flush();
  await rejected;
});

test('options outside their range throw at the call, before anything opens', async () => {
  const app = await apis();
  const invalid: [Record<string, unknown>, RegExp][] = [
    [{ quality: 1.5 }, /quality must be between 0 and 1, not 1\.5/],
    [{ quality: -0.1 }, /quality must be between 0 and 1/],
    [{ selectionLimit: -1 }, /selectionLimit must be 0 \(no limit\) or a positive integer, not -1/],
    [{ selectionLimit: 2.5 }, /selectionLimit must be 0 \(no limit\) or a positive integer/],
    [{ mediaTypes: [] }, /mediaTypes must name images, videos or both/],
    [{ mediaTypes: ['gifs'] }, /mediaTypes must name images, videos or both, not gifs/],
    [{ maxWidth: 0 }, /maxWidth must be a positive number of pixels, not 0/],
    [{ maxHeight: Infinity }, /maxHeight must be a positive number of pixels/],
    [
      { allowsEditing: true, selectionLimit: 3 },
      /allowsEditing edits one asset: drop it or set selectionLimit to 1/,
    ],
  ];

  for (const [options, message] of invalid)
    await assert.rejects(
      app.mediaPicker.pick(options),
      (error: Error) => error.name === 'TypeError' && message.test(error.message),
      JSON.stringify(options),
    );

  assert.deepEqual(app.queued, [], 'nothing reached the platform');
});

test('the module ships its FileProvider, camera reasons and Permissions only when imported', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-image-picker-'));
  const modules = await loadModules(temp).finally(() => rmSync(temp, { recursive: true }));
  const picker = modules.find(({ manifest }) => manifest.name === 'ImagePicker');

  assert.ok(picker, 'native/modules/image-picker');
  assert.deepEqual(picker.manifest.requires, ['Permissions']);
  assert.ok(picker.manifest.ios?.infoPlist.NSCameraUsageDescription);
  assert.ok(picker.manifest.ios?.infoPlist.NSMicrophoneUsageDescription);

  const [provider] = picker.manifest.android?.providers ?? [];

  assert.equal(provider?.attributes.authorities, '${applicationId}.kuito.imagepicker');
  assert.equal(provider?.attributes.grantUriPermissions, 'true');
  assert.equal(provider?.attributes.exported, 'false');

  const paths = provider?.resources['android.support.FILE_PROVIDER_PATHS'];

  assert.equal(paths, '@xml/kuito_image_picker_paths');
  assert.ok(picker.androidResources);

  const xml = join(picker.androidResources, 'xml/kuito_image_picker_paths.xml');

  assert.ok(existsSync(xml));
  assert.match(readFileSync(xml, 'utf8'), /<cache-path name="[^"]+" path="ImagePicker\/" \/>/);
});
