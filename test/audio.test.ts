import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// audio as an app calls it, against a fake platform that answers like the
// iOS and Android modules. Players and recorders are native objects named by
// id and owned by the scope that made them: what matters here is that each
// lives exactly as long as its scope, that its state is signals the
// platform's reports keep, and that time moves on the UI thread between
// reports instead of arriving as events.

interface Subscription {
  remove(): void;
}

interface Signal<T> {
  value: T;
}

interface Motion {
  value: number;
}

interface Player {
  readonly id: number;
  readonly playing: Signal<boolean>;
  readonly loaded: Signal<boolean>;
  readonly buffering: Signal<boolean>;
  readonly volume: Signal<number>;
  readonly rate: Signal<number>;
  readonly loop: Signal<boolean>;
  readonly time: Motion;
  readonly duration: Motion;
  readonly error: Signal<string | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  watch(event: 'ended', listener: () => void): Subscription;
}

interface Recorder {
  readonly id: number;
  readonly recording: Signal<boolean>;
  readonly time: Motion;
  readonly level: Motion;
  start(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<{ uri: string; duration: number }>;
}

interface Scope {
  app: object;
  audio: {
    player(source: unknown, options?: object): Player;
    recorder(options?: object): Recorder;
    configure(mode: object): Promise<void>;
    watch(
      event: 'interruption',
      listener: (event: { type: string; shouldResume: boolean }) => void,
    ): Subscription;
  };
  showTrack(shown: boolean): void;
}

type Operation = { op: string; id?: string; value?: unknown };

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-audio-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/audio-app.tsx');

const SONG = 'https://example.com/song.mp3';

/** Ids come from the platform, which outlives a Live Patch that re-evaluates the module. */
function audio(firstId = 1): FakeModule {
  let ids = firstId - 1;
  const main = (run: (...args: unknown[]) => unknown = () => null) => ({
    thread: 'main' as const,
    run,
  });

  return {
    functions: {
      nextId: { thread: 'js', run: () => ++ids },
      createPlayer: main(),
      play: main(),
      pause: main(),
      seekTo: main(),
      setVolume: main(),
      setRate: main(),
      setLoop: main(),
      releasePlayer: main(),
      createRecorder: main(),
      startRecording: main(),
      pauseRecording: main(),
      stopRecording: main(() => ({ uri: 'file:///data/Caches/recording-1.m4a', duration: 3.5 })),
      releaseRecorder: main(),
      setAudioMode: main(),
    },
  };
}

/** Lets the kernel's scheduled updates and promise callbacks run. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

async function launch(firstId = 1) {
  const native = fakeModules({ Audio: audio(firstId) });
  const views = new Map<string, Record<string, unknown>>();
  const operations: Operation[] = [];
  const logs: [string, string][] = [];
  const kernel = installKernel(
    hosting({
      createView(id: string) {
        views.set(id, {});
      },
      setProp(id: string, name: string, value: unknown) {
        const props = views.get(id);

        if (props) props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      moveView() {},
      ui(sent: unknown[]) {
        operations.push(...(sent as Operation[]));
      },
      // A UI runtime is there, so motion values move on its thread.
      __kuitoHostMotionRead: () => '',
      __kuitoHostLog(level: string, message: string) {
        logs.push([level, message]);
      },
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  const scope: Scope = kernel as never;

  /** Starts `call`, settles what it queued, and returns its result. */
  async function run<T>(call: () => Promise<T>): Promise<T> {
    const result = call();

    native.flush();
    await settle();

    return result;
  }

  return {
    ...native,
    ...scope,
    /** The calls that act on audio; `nextId` only names what they act on. */
    get calls() {
      return native.calls.filter((call) => call.method !== 'nextId');
    },
    run,
    operations,
    logs,
    text: () => views.get('track')?.text,
    get track(): Player {
      return (kernel as never as { track: Player }).track;
    },
  };
}

const typeError = (pattern: RegExp) => (error: Error) => {
  assert.equal(error.name, 'TypeError');
  assert.match(error.message, pattern);

  return true;
};

const status = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  isLoaded: true,
  playing: false,
  isBuffering: false,
  currentTime: 0,
  duration: 180,
  ended: false,
  volume: 1,
  rate: 1,
  loop: false,
  error: null,
  ...overrides,
});

test('a component’s player is made when it mounts and released when it unmounts', async () => {
  const app = await launch();

  app.showTrack(true);
  await settle();
  await app.run(() => Promise.resolve());

  const { id } = app.track;

  assert.deepEqual(data(app.calls), [
    {
      module: 'Audio',
      method: 'createPlayer',
      args: [{ id, uri: SONG, volume: 1, rate: 1, loop: true }],
    },
  ]);

  assert.deepEqual(app.observed, ['start Audio.playerStatus']);

  app.showTrack(false);
  await settle();
  await app.run(() => Promise.resolve());

  assert.deepEqual(
    app.calls.map(({ method }) => method),
    ['createPlayer', 'releasePlayer'],
  );

  assert.deepEqual(app.observed, ['start Audio.playerStatus', 'stop Audio.playerStatus']);

  assert.ok(
    app.operations.some((operation) => operation.op === 'free'),
    'its motion values go with it',
  );
});

test('outside a component a player needs the app scope', async () => {
  const app = await launch();

  assert.throws(() => app.audio.player(SONG), {
    message:
      /audio\.player\(\) must run while a component sets up, which owns it; pass \{ scope: app \}/,
  });

  const held = app.audio.player(SONG, { scope: app.app, volume: 0.5, rate: 1.5 });

  await app.run(() => Promise.resolve());

  assert.deepEqual(data(app.calls), [
    {
      module: 'Audio',
      method: 'createPlayer',
      args: [{ id: held.id, uri: SONG, volume: 0.5, rate: 1.5, loop: false }],
    },
  ]);
});

test('ids come from the platform, so a re-evaluated module never reuses a live one', async () => {
  const app = await launch(41);
  const first = app.audio.player(SONG, { scope: app.app });
  const second = app.audio.player(SONG, { scope: app.app });

  assert.deepEqual([first.id, second.id], [41, 42]);
});

test('a source or option the platform cannot play fails before anything crosses', async () => {
  const app = await launch();
  const scope = { scope: app.app };

  assert.throws(
    () => app.audio.player('song.mp3', scope),
    typeError(/audio\.player: 'song\.mp3' is not an http\(s\), file:\/\/ or asset:\/\/\/ URI/),
  );

  assert.throws(
    () => app.audio.player(SONG, { ...scope, volume: 2 }),
    typeError(/volume must be a number from 0 to 1, not 2/),
  );

  assert.throws(
    () => app.audio.player(SONG, { ...scope, rate: 4 }),
    typeError(/rate must be a number from 0\.5 to 2, not 4/),
  );

  assert.throws(
    () => app.audio.recorder({ ...scope, format: 'mp3' }),
    typeError(/format must be 'aac' or 'wav', not 'mp3'/),
  );

  assert.deepEqual(app.calls, []);
});

test('the platform’s report is the player’s signals, and time runs on the UI thread', async () => {
  const app = await launch();
  const player = app.audio.player(SONG, { scope: app.app });

  await app.run(() => Promise.resolve());

  const before = app.operations.length;

  app.emit('Audio', 'playerStatus', status(player.id, { playing: true, currentTime: 30, rate: 2 }));

  assert.equal(player.playing.value, true);
  assert.equal(player.loaded.value, true);
  assert.equal(player.duration.value, 180);

  await app.run(() => Promise.resolve());

  const sent = app.operations.slice(before).filter((operation) => operation.op === 'motion');
  const [anchor, clock] = sent.slice(-2).map((operation) => data(operation.value));

  assert.equal(anchor, 30);

  assert.deepEqual(clock, {
    __kuitoAnimation: { type: 'timing', duration: 75000, easing: [0, 0, 1, 1], delay: 0 },
    target: 180,
  });
});

test('while it plays, the player crosses nothing: no calls, no events', async () => {
  const app = await launch();
  const player = app.audio.player(SONG, { scope: app.app });

  await app.run(() => Promise.resolve());
  app.emit('Audio', 'playerStatus', status(player.id, { playing: true, currentTime: 0 }));
  await app.run(() => Promise.resolve());

  const calls = app.calls.length;
  const operations = app.operations.length;

  await app.run(() => Promise.resolve());
  await app.run(() => Promise.resolve());

  assert.equal(app.calls.length, calls);
  assert.equal(app.operations.length, operations);
});

test('a paused, loading or buffering player holds time where the platform reports it', async () => {
  const app = await launch();
  const player = app.audio.player(SONG, { scope: app.app });

  await app.run(() => Promise.resolve());

  for (const report of [
    { playing: false },
    { playing: true, isBuffering: true },
    { playing: true, isLoaded: false },
  ]) {
    const before = app.operations.length;

    app.emit('Audio', 'playerStatus', status(player.id, { ...report, currentTime: 12 }));
    await app.run(() => Promise.resolve());

    const sent = app.operations.slice(before).filter((operation) => operation.op === 'motion');

    assert.ok(
      sent.every((operation) => typeof operation.value !== 'object'),
      JSON.stringify(report),
    );
  }

  assert.equal(player.time.value, 12);
});

test('playing, volume, rate and loop are two-way: a write asks the platform', async () => {
  const app = await launch();
  const player = app.audio.player(SONG, { scope: app.app });

  await app.run(() => Promise.resolve());
  player.playing.value = true;
  player.volume.value = 0.25;
  player.rate.value = 1.5;
  player.loop.value = true;
  assert.equal(player.volume.value, 0.25, 'a write shows at once');
  await app.run(() => Promise.resolve());
  player.playing.value = false;
  await app.run(() => player.seek(42));

  assert.deepEqual(data(app.calls.slice(1).map(({ method, args }) => [method, ...args])), [
    ['play', player.id],
    ['setVolume', player.id, 0.25],
    ['setRate', player.id, 1.5],
    ['setLoop', player.id, true],
    ['pause', player.id],
    ['seekTo', player.id, 42],
  ]);
});

test('a rejected write goes back and through the error seam', async () => {
  const app = await launch();
  const player = app.audio.player(SONG, { scope: app.app });

  await app.run(() => Promise.resolve());
  player.volume.value = 3;
  await app.run(() => Promise.resolve());

  assert.equal(player.volume.value, 1);

  assert.ok(
    app.logs.some(
      ([level, message]) => level === 'error' && /player\.volume could not be set/.test(message),
    ),
    JSON.stringify(app.logs),
  );
});

test('ended is an event, each time round for a looping player', async () => {
  const app = await launch();
  const player = app.audio.player(SONG, { scope: app.app, loop: true });
  let ended = 0;
  const subscription = player.watch('ended', () => ended++);

  await app.run(() => Promise.resolve());
  app.emit('Audio', 'playerStatus', status(player.id, { playing: true, ended: true, loop: true }));
  app.emit('Audio', 'playerStatus', status(player.id, { playing: true, ended: true, loop: true }));
  subscription.remove();
  app.emit('Audio', 'playerStatus', status(player.id, { playing: true, ended: true, loop: true }));

  assert.equal(ended, 2);
});

test('each player hears only its own report', async () => {
  const app = await launch();
  const first = app.audio.player(SONG, { scope: app.app });
  const second = app.audio.player(SONG, { scope: app.app });

  await app.run(() => Promise.resolve());
  app.emit('Audio', 'playerStatus', status(second.id, { playing: true, duration: -1 }));

  assert.equal(first.playing.value, false);
  assert.equal(second.playing.value, true);
  assert.equal(second.duration.value, 0, 'an unknown duration is 0');
});

test('a recorder records, and stop resolves the file', async () => {
  const app = await launch();
  const recorder = app.audio.recorder({ scope: app.app, quality: 'medium', metering: true });

  await app.run(() => recorder.start());

  app.emit('Audio', 'recorderStatus', {
    id: recorder.id,
    recording: true,
    currentTime: 0,
    metering: -30,
  });

  await app.run(() => Promise.resolve());

  assert.equal(recorder.recording.value, true);

  const recording = await app.run(() => recorder.stop());

  assert.deepEqual(data(recording), { uri: 'file:///data/Caches/recording-1.m4a', duration: 3.5 });

  assert.deepEqual(data(app.calls.map(({ method, args }) => [method, ...args])), [
    ['createRecorder', { id: recorder.id, format: 'aac', quality: 'medium', metering: true }],
    ['startRecording', recorder.id],
    ['stopRecording', recorder.id],
  ]);
});

test('a recorder’s level eases to each sample on the UI thread; time runs between reports', async () => {
  const app = await launch();
  const recorder = app.audio.recorder({ scope: app.app, metering: true });

  await app.run(() => Promise.resolve());

  const before = app.operations.length;

  app.emit('Audio', 'recorderStatus', {
    id: recorder.id,
    recording: true,
    currentTime: 1,
    metering: -30,
  });

  app.emit('Audio', 'recorderStatus', {
    id: recorder.id,
    recording: true,
    currentTime: 1.1,
    metering: -12,
  });

  await app.run(() => Promise.resolve());

  const values = app.operations
    .slice(before)
    .filter((operation) => operation.op === 'motion')
    .map((operation) => data(operation.value));
  const levels = values.filter(
    (value) => typeof value === 'object' && value !== null && Reflect.get(value, 'target') < 0,
  );
  const clocks = values.filter(
    (value) => typeof value === 'object' && value !== null && Reflect.get(value, 'target') > 0,
  );

  assert.deepEqual(
    levels.map((value) => Reflect.get(Object(value), 'target')),
    [-30, -12],
  );

  assert.equal(clocks.length, 1, 'a level report leaves the running clock alone');
});

test('configure merges into the mode set so far', async () => {
  const app = await launch();

  await app.run(() => app.audio.configure({ allowsRecording: true }));
  await app.run(() => app.audio.configure({ duckOthers: true }));

  assert.deepEqual(data(app.calls.map(({ args }) => args[0])), [
    {
      playsInSilentMode: true,
      mixWithOthers: false,
      duckOthers: false,
      allowsRecording: true,
      staysActiveInBackground: false,
    },
    {
      playsInSilentMode: true,
      mixWithOthers: false,
      duckOthers: true,
      allowsRecording: true,
      staysActiveInBackground: false,
    },
  ]);

  await assert.rejects(
    app.audio.configure({ duckOthers: 'yes' }),
    typeError(/audio\.configure: duckOthers must be a boolean/),
  );
});

test('interruptions reach audio.watch', async () => {
  const app = await launch();
  const heard: unknown[] = [];
  const subscription = app.audio.watch('interruption', (event) => heard.push(event));

  app.emit('Audio', 'interruption', { type: 'began', shouldResume: false });
  app.emit('Audio', 'interruption', { type: 'ended', shouldResume: true });
  subscription.remove();

  assert.deepEqual(data(heard), [
    { type: 'began', shouldResume: false },
    { type: 'ended', shouldResume: true },
  ]);

  assert.deepEqual(app.observed, ['start Audio.interruption', 'stop Audio.interruption']);
});
