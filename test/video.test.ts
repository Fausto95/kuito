import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel, type Props, type Ref } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';

// The Video view as an app renders it, against a fake platform that describes
// the module like the iOS and Android registries do. The players themselves
// are native; what matters here is what crosses: props as the view's own,
// events back as on* handlers, and ref calls aimed at the right view.

interface VideoHandle {
  readonly id: string;
  seek(seconds: unknown): Promise<unknown>;
  play(): Promise<unknown>;
  pause(): Promise<unknown>;
  enterFullscreen(): Promise<unknown>;
  exitFullscreen(): Promise<unknown>;
  startPictureInPicture(): Promise<unknown>;
  stopPictureInPicture(): Promise<unknown>;
}

interface ClipRef extends Ref<VideoHandle> {
  readonly playing: { readonly value: boolean };
  readonly loaded: { readonly value: boolean };
  readonly buffering: { readonly value: boolean };
  readonly fullscreen: { readonly value: boolean };
  readonly error: { readonly value: string | null };
  readonly time: { readonly value: number };
  readonly duration: { readonly value: number };
}

interface Scope {
  player: Ref<VideoHandle>;
  clip: ClipRef;
  ends: number[];
  events: { value: unknown[] };
  showPlayers(shown: boolean): void;
  setPaused(paused: boolean): void;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-video-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/video-app.tsx');

const FUNCTIONS = [
  'seek',
  'play',
  'pause',
  'enterFullscreen',
  'exitFullscreen',
  'startPictureInPicture',
  'stopPictureInPicture',
];

const video = (): FakeModule => ({
  functions: Object.fromEntries(
    FUNCTIONS.map((name) => [name, { thread: 'main' as const, run: () => null }]),
  ),
  view: {
    events: [
      'load',
      'progress',
      'buffer',
      'end',
      'error',
      'playbackStateChange',
      'fullscreenChange',
      'pictureInPictureChange',
    ],
    functions: FUNCTIONS,
  },
});

/** Lets the kernel's scheduled updates and promise callbacks run. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

async function launch() {
  const native = fakeModules({ Video: video() });
  const views = new Map<string, { kind: string; props: Props }>();
  const kernel = installKernel(
    hosting({
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        const view = views.get(id);

        if (view) view.props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      moveView() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  const scope: Scope = kernel as never;
  const kuito = kernel.__kuito;

  return {
    ...native,
    ...scope,
    views,
    /** The number view `label` crosses the host boundary as. */
    id: (label: string) => handleOf(kuito, label),
    /** A native event from view `id`. */
    send: (id: string, event: string, payload?: object) =>
      nativeEvent(kuito, id + '.' + event + (payload ? '\u001f' + JSON.stringify(payload) : '')),
    handle(which: Ref<VideoHandle>) {
      const current = which.current;

      assert.ok(current, 'the ref holds the video');

      return current;
    },
  };
}

test('a Video renders as the Video module view with its own props', async () => {
  const app = await launch();
  const movie = app.views.get('movie');

  assert.equal(movie?.kind, 'module:Video');

  assert.deepEqual(data(movie?.props), {
    src: { uri: 'https://example.com/movie.m3u8' },
    paused: true,
    muted: true,
    volume: 0.5,
    rate: 1.5,
    loop: true,
    objectFit: 'cover',
    controls: true,
    progressInterval: 500,
    height: 220,
  });

  assert.deepEqual(app.loads, ['Video'], 'the module loads once, for both players');
});

test('a Video sends only the props the app gives it; the platform has the defaults', async () => {
  const app = await launch();

  assert.deepEqual(data(app.views.get('clip')?.props), {
    src: { uri: 'file:///data/Caches/clip.mp4' },
    height: 120,
  });
});

test('a reactive prop updates only that prop', async () => {
  const app = await launch();
  const props = app.views.get('movie')?.props ?? {};

  delete props.muted;
  app.setPaused(false);
  await settle();

  assert.equal(props.paused, false);
  assert.equal('muted' in props, false, 'the other props are not sent again');
});

test('the native events reach the on* handlers with their payloads', async () => {
  const app = await launch();

  app.send('movie', 'load', {
    duration: 634.5,
    currentTime: 0,
    naturalSize: { width: 1920, height: 1080 },
  });

  app.send('movie', 'buffer', { isBuffering: true });
  app.send('movie', 'playbackStateChange', { isPlaying: true });
  app.send('movie', 'progress', { currentTime: 1.25, playableDuration: 12 });
  app.send('movie', 'fullscreenChange', { fullscreen: true });
  app.send('movie', 'pictureInPictureChange', { active: false });
  app.send('movie', 'error', { code: 'ERR_VIDEO_SOURCE', message: 'The stream ended' });
  app.send('movie', 'end');

  assert.deepEqual(data(app.events.value), [
    ['load', { duration: 634.5, currentTime: 0, naturalSize: { width: 1920, height: 1080 } }],
    ['buffer', { isBuffering: true }],
    ['playbackStateChange', { isPlaying: true }],
    ['progress', { currentTime: 1.25, playableDuration: 12 }],
    ['fullscreenChange', { fullscreen: true }],
    ['pictureInPictureChange', { active: false }],
    ['error', { code: 'ERR_VIDEO_SOURCE', message: 'The stream ended' }],
    ['end', {}],
  ]);
});

test('ref calls cross as the view functions of the video they name', async () => {
  const app = await launch();
  const movie = app.handle(app.player);
  const clip = app.handle(app.clip);

  void movie.seek(42.5);
  void movie.play();
  void clip.pause();
  void movie.enterFullscreen();
  void movie.exitFullscreen();
  void clip.startPictureInPicture();
  void clip.stopPictureInPicture();

  assert.deepEqual(data(app.queued), [
    { module: 'Video', method: 'seek', args: [app.id('movie'), 42.5] },
    { module: 'Video', method: 'play', args: [app.id('movie')] },
    { module: 'Video', method: 'pause', args: [app.id('clip')] },
    { module: 'Video', method: 'enterFullscreen', args: [app.id('movie')] },
    { module: 'Video', method: 'exitFullscreen', args: [app.id('movie')] },
    { module: 'Video', method: 'startPictureInPicture', args: [app.id('clip')] },
    { module: 'Video', method: 'stopPictureInPicture', args: [app.id('clip')] },
  ]);

  const seeking = movie.seek(10);

  app.flush();
  await settle();

  assert.equal(await seeking, null);
});

test('unmounting a Video removes its view, and its ref stops calling it', async () => {
  const app = await launch();
  const movie = app.handle(app.player);

  app.showPlayers(false);
  await settle();

  assert.equal(app.views.has('movie'), false, 'the native view, and its player, go');
  assert.equal(app.views.has('clip'), false);
  assert.equal(app.player.current, null);
  await assert.rejects(movie.play(), /Video\.play: the view movie is not mounted/);
  assert.deepEqual(app.queued, []);
});

test('a videoRef holds the video as signals and time as a motion value', async () => {
  const app = await launch();

  assert.ok(app.clip.current, 'it is the clip’s ref');
  assert.equal(app.clip.loaded.value, false);

  app.send('clip', 'load', {
    duration: 42,
    currentTime: 0,
    naturalSize: { width: 1920, height: 1080 },
  });

  assert.equal(app.clip.loaded.value, true);
  assert.equal(app.clip.duration.value, 42);

  app.send('clip', 'playbackStateChange', { isPlaying: true, currentTime: 3, rate: 1 });
  assert.equal(app.clip.playing.value, true);

  app.send('clip', 'playbackStateChange', { isPlaying: false, currentTime: 7.5, rate: 1 });
  assert.equal(app.clip.playing.value, false);
  assert.equal(app.clip.time.value, 7.5, 'paused, time holds where the player reports it');

  app.send('clip', 'buffer', { isBuffering: true });
  app.send('clip', 'fullscreenChange', { fullscreen: true });
  app.send('clip', 'error', { code: 'ERR_PLAYBACK', message: 'The stream ended' });
  app.send('clip', 'end');
  app.send('clip', 'end');

  assert.equal(app.clip.buffering.value, true);
  assert.equal(app.clip.fullscreen.value, true);
  assert.equal(app.clip.error.value, 'The stream ended');
  assert.deepEqual(data(app.ends), [1, 2]);

  app.showPlayers(false);
  await settle();
  assert.equal(app.clip.current, null, 'unmounted, it holds no video');
});
