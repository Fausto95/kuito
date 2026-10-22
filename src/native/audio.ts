import { easing, timing } from '../ui/animations';
import type { Motion } from '../ui/motion';
import type { Signal } from '../ui/reactivity';
import AudioModule, {
  type AudioInterruption as Interruption,
  type AudioMode as Mode,
  type AudioPlayerRequest,
  type AudioPlayerStatus,
  type AudioRecorderRequest,
  type AudioRecorderStatus,
  type AudioRecording,
  type RecordingFormat as Format,
  type RecordingQuality as Quality,
} from '../../native/modules/audio/audio';
import type { EventSubscription } from './modules';
import {
  freeMotion,
  motionValue,
  owned,
  report,
  signal,
  watching,
  type ReadonlySignal,
  type ScopeOptions,
} from './scope';

/** A URL, a `file://` path, or a bundled file: `fileSystem.bundle + name`. */
export type AudioSource = string | { uri: string };

export type AudioPlayerOptions = ScopeOptions & {
  /** 0 to 1. Defaults to 1. */
  volume?: number;
  /** 0.5 to 2, pitch kept. Defaults to 1. */
  rate?: number;
  /** Starts over at the end instead of stopping. Defaults to false. */
  loop?: boolean;
};

/**
 * A native player the scope that made it owns (docs/audio.md). Its state is
 * signals; `playing`, `volume`, `rate` and `loop` are two-way, so assigning
 * one asks the platform. `time` and `duration` are motion values: the UI
 * thread moves `time` along the platform's clock while playing, so a
 * progress bar bound to it costs the JS thread nothing.
 */
export type AudioPlayer = {
  readonly id: number;
  readonly playing: Signal<boolean>;
  /** The source is open and its duration known, or known to be unknown (a live stream). */
  readonly loaded: ReadonlySignal<boolean>;
  /** Waiting for data: playing resumes on its own once enough has arrived. */
  readonly buffering: ReadonlySignal<boolean>;
  /** 0 to 1. */
  readonly volume: Signal<number>;
  /** 0.5 to 2. */
  readonly rate: Signal<number>;
  readonly loop: Signal<boolean>;
  /** Seconds from the start. */
  readonly time: Motion<number>;
  /** Seconds; 0 until loaded, and for a live stream. */
  readonly duration: Motion<number>;
  /** Why the source failed to load or play. */
  readonly error: ReadonlySignal<string | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  /** Calls `listener` each time playback reaches the end; a looping player each time round. */
  watch(event: 'ended', listener: () => void): EventSubscription;
};

/** `aac` writes `.m4a` on both platforms; `wav` is 16-bit PCM, iOS only (docs/audio.md). */
export type RecordingFormat = Format;

export type RecordingQuality = Quality;

export type AudioRecorderOptions = ScopeOptions & {
  /** Defaults to `'aac'`. */
  format?: RecordingFormat;
  /** Sample rate, channels and bit rate (docs/audio.md). Defaults to `'high'`. */
  quality?: RecordingQuality;
  /** Measures the input level into `level`. Defaults to false. */
  metering?: boolean;
};

export type Recording = AudioRecording;

/** A native recorder the scope that made it owns (docs/audio.md). */
export type AudioRecorder = {
  readonly id: number;
  readonly recording: ReadonlySignal<boolean>;
  /** Seconds recorded so far, moved by the UI thread while recording. */
  readonly time: Motion<number>;
  /** The input level in dBFS, -160 (silence) to 0, when `metering` is on. */
  readonly level: Motion<number>;
  readonly error: ReadonlySignal<string | null>;
  /** Starts a new file, asking for the microphone first, or resumes a paused one. */
  start(): Promise<void>;
  pause(): Promise<void>;
  /** Finishes the file and resolves its `file://` URI, in the cache directory. */
  stop(): Promise<Recording>;
};

/** The app's audio session, which `configure` sets. */
export type AudioMode = Mode;

/** The system interrupting the app's audio (a call, an alarm), and the interruption ending. */
export type AudioInterruption = Interruption;

// Playback, recording and the app's audio session: AVPlayer and
// AVAudioRecorder on iOS, MediaPlayer and MediaRecorder on Android.

const SOURCE = /^(https?:\/\/|file:\/\/|asset:\/\/\/)/;

/** How long a clock with no end runs before the next report re-anchors it: a day. */
const OPEN_ENDED = 86_400;

/** The platform samples the level this often while metering, so the motion value eases between. */
const LEVEL_INTERVAL = 100;

function sourceUri(source: AudioSource): string {
  const uri = typeof source === 'object' && source !== null ? source.uri : source;

  if (typeof uri !== 'string' || !SOURCE.test(uri))
    throw new TypeError(
      `audio.player: '${String(uri)}' is not an http(s), file:// or asset:/// URI`,
    );

  return uri;
}

function range(method: string, name: string, value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !(value >= min && value <= max))
    throw new TypeError(
      `${method}: ${name} must be a number from ${min}${max === Infinity ? '' : ` to ${max}`}, not ${String(value)}`,
    );

  return value;
}

function flag(method: string, name: string, value: unknown) {
  if (typeof value !== 'boolean') throw new TypeError(`${method}: ${name} must be a boolean`);

  return value;
}

function oneOf<T extends string>(method: string, name: string, value: unknown, options: T[]): T {
  const found = options.find((option) => option === value);

  if (found === undefined) {
    const quoted = options.map((option) => `'${option}'`);
    const list = `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;

    throw new TypeError(`${method}: ${name} must be ${list}, not '${String(value)}'`);
  }

  return found;
}

/**
 * Routes one module event to the handle each payload names. The module is
 * observed only while a handle is alive.
 */
function router<P extends { id: number }>(event: {
  addListener(listener: (payload: P) => void): EventSubscription;
}) {
  const routes = new Map<number, (payload: P) => void>();
  let subscription: EventSubscription | null = null;

  return {
    add(id: number, route: (payload: P) => void) {
      routes.set(id, route);

      subscription ??= event.addListener((payload) => routes.get(payload.id)?.(payload));
    },
    remove(id: number) {
      routes.delete(id);

      if (routes.size === 0 && subscription) {
        subscription.remove();
        subscription = null;
      }
    },
  };
}

const players = /* @__PURE__ */ router(AudioModule.playerStatus);
const recorders = /* @__PURE__ */ router(AudioModule.recorderStatus);

/**
 * A native object's lifetime: made when its scope starts it, freed when the
 * scope ends. The platform runs a module's calls in order, so a call made
 * once it is started follows its creation without waiting for it.
 */
function lifetime(kind: string, failed: (error: Error) => void) {
  let made: Promise<void> | null = null;
  let released = false;

  return {
    start(create: () => Promise<void>) {
      made = create();
      made.catch(failed);
    },
    call<T>(method: string, work: () => Promise<T>): Promise<T> {
      if (released)
        return Promise.reject(new Error(`${kind}.${method}: its scope ended, which released it`));

      if (!made)
        return Promise.reject(
          new Error(
            `${kind}.${method}: it is made when its component mounts; call it from then on`,
          ),
        );

      try {
        return work();
      } catch (error) {
        return Promise.reject(error);
      }
    },
    release(free: () => Promise<void>) {
      if (released) return;

      released = true;

      // One the platform never made, or failed to make, has nothing to free.
      made?.then(free, () => {}).catch(report(kind + ' could not be released'));
    },
  };
}

/** A signal the app writes to ask the platform, and the platform's reports set. */
function twoWay<T>(initial: T, write: (value: T) => Promise<void>, what: string) {
  const current = signal(initial);
  const exposed: Signal<T> = {
    get value() {
      return current.value;
    },
    set value(next) {
      const previous = current.value;

      current.value = next;

      write(next).catch((error: unknown) => {
        current.value = previous;
        report(what + ' could not be set')(error);
      });
    },
  };

  return { exposed, current };
}

/** Moves `time` along a linear clock from `from` toward `to` at `rate` seconds per second. */
function run(time: Motion<number>, from: number, to: number, rate: number) {
  time.value = from;

  time.value = timing({
    duration: (Math.max(0, to - from) / rate) * 1000,
    easing: easing.linear,
  }).to(to);
}

/**
 * A player for `src`, owned by the component setting up: it is made when the
 * component mounts and released when it unmounts. `{ scope: app }` makes one
 * the app holds for its life.
 */
export function player(src: AudioSource, options: AudioPlayerOptions = {}): AudioPlayer {
  const method = 'audio.player';
  const request = {
    uri: sourceUri(src),
    volume: range(method, 'volume', options.volume ?? 1, 0, 1),
    rate: range(method, 'rate', options.rate ?? 1, 0.5, 2),
    loop: flag(method, 'loop', options.loop ?? false),
  };

  return owned(
    method,
    options,
    () => makePlayer(request),
    (made) => {
      made.start();

      return made.release;
    },
  ).player;
}

function makePlayer(request: Omit<AudioPlayerRequest, 'id'>) {
  const id = AudioModule.nextId();
  const error = signal<string | null>(null);
  const handle = lifetime('AudioPlayer', (failure) => (error.value = failure.message));
  const call = (name: string, work: () => Promise<void>) => handle.call(name, work);
  const playing = twoWay(
    false,
    (on) => call(on ? 'play' : 'pause', () => (on ? AudioModule.play(id) : AudioModule.pause(id))),
    'player.playing',
  );
  const volume = twoWay(
    request.volume,
    (value) =>
      call('volume', () =>
        AudioModule.setVolume(id, range('player.volume', 'volume', value, 0, 1)),
      ),
    'player.volume',
  );
  const rate = twoWay(
    request.rate,
    (value) =>
      call('rate', () => AudioModule.setRate(id, range('player.rate', 'rate', value, 0.5, 2))),
    'player.rate',
  );
  const loop = twoWay(
    request.loop,
    (value) => call('loop', () => AudioModule.setLoop(id, flag('player.loop', 'loop', value))),
    'player.loop',
  );
  const loaded = signal(false);
  const buffering = signal(false);
  const time = motionValue(0);
  const duration = motionValue(0);
  const ended = new Set<() => void>();

  const update = (status: AudioPlayerStatus) => {
    const known = status.duration >= 0 ? status.duration : 0;

    playing.current.value = status.playing;
    loaded.value = status.isLoaded;
    buffering.value = status.isBuffering;
    volume.current.value = status.volume;
    rate.current.value = status.rate;
    loop.current.value = status.loop;
    error.value = status.error;
    duration.value = known;

    if (status.playing && status.isLoaded && !status.isBuffering)
      run(
        time,
        status.currentTime,
        known > 0 ? known : status.currentTime + OPEN_ENDED,
        status.rate,
      );
    else time.value = status.currentTime;

    if (status.ended) ended.forEach((listener) => listener());
  };

  const player: AudioPlayer = {
    id,
    playing: playing.exposed,
    loaded,
    buffering,
    volume: volume.exposed,
    rate: rate.exposed,
    loop: loop.exposed,
    time,
    duration,
    error,
    play: () => call('play', () => AudioModule.play(id)),
    pause: () => call('pause', () => AudioModule.pause(id)),
    seek: (seconds) =>
      call('seek', () =>
        AudioModule.seekTo(id, range('player.seek', 'seconds', seconds, 0, Infinity)),
      ),
    watch(event, listener) {
      if (event !== 'ended')
        throw new TypeError(`player.watch: no '${String(event)}' event; watch ended`);

      return watching('player.watch', () => {
        ended.add(listener);

        return { remove: () => ended.delete(listener) };
      });
    },
  };

  return {
    player,
    start: () => {
      players.add(id, update);
      handle.start(() => AudioModule.createPlayer({ id, ...request }));
    },
    release: () => {
      players.remove(id);
      ended.clear();
      handle.release(() => AudioModule.releasePlayer(id));
      freeMotion(time);
      freeMotion(duration);
    },
  };
}

/**
 * A recorder owned by the component setting up, as `player` is; `{ scope:
 * app }` makes one the app holds.
 */
export function recorder(options: AudioRecorderOptions = {}): AudioRecorder {
  const method = 'audio.recorder';
  const request = {
    format: oneOf<RecordingFormat>(method, 'format', options.format ?? 'aac', ['aac', 'wav']),
    quality: oneOf<RecordingQuality>(method, 'quality', options.quality ?? 'high', [
      'low',
      'medium',
      'high',
    ]),
    metering: flag(method, 'metering', options.metering ?? false),
  };

  return owned(
    method,
    options,
    () => makeRecorder(request),
    (made) => {
      made.start();

      return made.release;
    },
  ).recorder;
}

function makeRecorder(request: Omit<AudioRecorderRequest, 'id'>) {
  const id = AudioModule.nextId();
  const error = signal<string | null>(null);
  const handle = lifetime('AudioRecorder', (failure) => (error.value = failure.message));
  const recording = signal(false);
  const time = motionValue(0);
  const level = motionValue(-160);
  let wasRecording = false;

  const update = (status: AudioRecorderStatus) => {
    recording.value = status.recording;

    // The clock is anchored when recording starts or stops; level reports
    // in between leave it running.
    if (status.recording !== wasRecording || !status.recording) {
      if (status.recording) run(time, status.currentTime, status.currentTime + OPEN_ENDED, 1);
      else time.value = status.currentTime;
    }

    wasRecording = status.recording;

    if (status.metering !== null)
      level.value = timing({ duration: LEVEL_INTERVAL, easing: easing.linear }).to(status.metering);
  };

  const recorder: AudioRecorder = {
    id,
    recording,
    time,
    level,
    error,
    start: () => handle.call('start', () => AudioModule.startRecording(id)),
    pause: () => handle.call('pause', () => AudioModule.pauseRecording(id)),
    stop: () => handle.call('stop', () => AudioModule.stopRecording(id)),
  };

  return {
    recorder,
    start: () => {
      recorders.add(id, update);
      handle.start(() => AudioModule.createRecorder({ id, ...request }));
    },
    release: () => {
      recorders.remove(id);
      handle.release(() => AudioModule.releaseRecorder(id));
      freeMotion(time);
      freeMotion(level);
    },
  };
}

const defaultMode: AudioMode = {
  playsInSilentMode: true,
  mixWithOthers: false,
  duckOthers: false,
  allowsRecording: false,
  staysActiveInBackground: false,
};

let mode: AudioMode = { ...defaultMode };

/** Sets the app's audio session: what `changes` leaves out keeps its current value. */
export async function configure(changes: Partial<AudioMode>): Promise<void> {
  const next = { ...mode };

  for (const key of Object.keys(defaultMode) as (keyof AudioMode)[])
    next[key] = flag('audio.configure', key, changes[key] ?? mode[key]);

  await AudioModule.setAudioMode(next);
  mode = next;
}

/**
 * Calls `listener` when the system interrupts the app's audio, and when the
 * interruption ends. In a component it stops when the component unmounts.
 */
export function watch(
  event: 'interruption',
  listener: (interruption: AudioInterruption) => void,
): EventSubscription {
  if (event !== 'interruption')
    throw new TypeError(`audio.watch: no '${String(event)}' event; watch interruption`);

  return watching('audio.watch', () => AudioModule.interruption.addListener(listener));
}
