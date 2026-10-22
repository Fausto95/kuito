// Dev session state: plain data in, plain data out. Every change goes through
// reduceSession; the feed is append-only (rendered once, then scrollback) and
// `epoch` changes when it is cleared so the renderer starts over.

import type { Diagnostic } from '../../dev/compiler.ts';
import type { BundledAsset } from '../../dev/assets.ts';
import type { NativeModuleUse } from '../../dev/modules/catalog.ts';
import type { PlacementFile } from '../../dev/transform.ts';
import type { ConsoleEntry, DeviceLink } from '../../dev/device-server.ts';
import type { Crash } from '../crash.ts';
import type { Device } from '../devices.ts';
import type { OutputStream } from '../runner.ts';

type AppStatus = 'idle' | 'running' | 'crashed' | 'exited';

export interface RunningStep {
  id: string;
  label: string;
  detail?: string;
}

interface Picker {
  devices: Device[];
  message?: string;
}

/** A device on the Live Patch link and the last patch it acked. */
export interface LinkedDevice {
  device: DeviceLink;
  status: 'connected' | 'applied' | 'rejected';
  revision?: number;
  /** Evaluating the revision on the device. */
  ms?: number;
  /** From the edit to the device's ack. */
  latency?: number;
  message?: string;
}

interface FeedItems {
  title: { device: Device };
  step: {
    label: string;
    ok: boolean;
    ms: number;
    message?: string;
    diagnostics?: Diagnostic[];
  };
  live: { entry: string; device: Device | null };
  app: { status: AppStatus; crash?: Crash };
  patch:
    | { ok: true; revision: number; ms: number; files: string[]; delivered: number }
    | { ok: false; diagnostics?: Diagnostic[]; files: string[]; ms: number };
  unchanged: { ms: number; files: string[] };
  applied: { device: string; revision: number; ms: number; latency?: number; files: string[] };
  refused: { device: string; revision: number; code: string; message: string };
  error: { source: string; message: string };
  note: { title: string; meta?: string };
  log: { source: string; stream?: OutputStream; text: string };
  console: ConsoleEntry;
  placement: { files: PlacementFile[] };
}

export type FeedKind = keyof FeedItems;

export type FeedItemOf<K extends FeedKind> = { id: number; kind: K; at?: number } & FeedItems[K];

export type FeedItem = { [K in FeedKind]: FeedItemOf<K> }[FeedKind];

type NewFeedItem = { [K in FeedKind]: { kind: K; at?: number } & FeedItems[K] }[FeedKind];

interface SessionState {
  entry: string;
  device: Device | null;
  running: RunningStep[];
  feed: FeedItem[];
  seq: number;
  epoch: number;
  revision: number;
  /** The edit behind the last revision, for the acks that follow it. */
  edit: { revision: number; files: string[] } | null;
  devices: LinkedDevice[];
  app: AppStatus;
  logs: boolean;
  help: boolean;
  url: string | null;
  picker: Picker | null;
  stopped: boolean;
}

interface SessionEvents {
  target: { device: Device };
  'step:start': RunningStep;
  'step:end': {
    id: string;
    ok: boolean;
    ms: number;
    message?: string;
    diagnostics?: Diagnostic[];
  };
  connected: {};
  app: { status: 'crashed' | 'exited'; crash?: Crash };
  ready: { url: string };
  patched: {
    revision: number;
    ms: number;
    files: string[];
    initial: boolean;
    delivered: number;
    nativeModules?: NativeModuleUse[];
    links?: number[];
    linkHash?: string;
    assets?: BundledAsset[];
  };
  unchanged: { ms: number; files: string[] };
  rejected: { diagnostics?: Diagnostic[]; files: string[]; ms: number; message?: string };
  'device:connected': { device: DeviceLink };
  'device:disconnected': { device: DeviceLink };
  'device:applied': { device: DeviceLink; revision: number; ms: number; latency?: number };
  'device:rejected': { device: DeviceLink; revision: number; code: string; message: string };
  error: { source: string; message: string };
  state: { key: string; value: unknown };
  /** The dev server opened Chrome DevTools on a runtime, named by `title`. */
  debugger: { title: string };
  recorded: { device: DeviceLink; file: string; bytes: number; truncated: boolean };
  log: { stream?: OutputStream; text: string; source?: string };
  console: ConsoleEntry;
  /** Where the compiler placed each changed file's code (docs/placement.md). */
  placement: { files: PlacementFile[] };
  pick: Picker;
  picked: {};
  logs: { on: boolean };
  help: {};
  clear: {};
  stopped: {};
}

type HandledType = keyof SessionEvents;

type EventOf<K extends HandledType> = { type: K; at?: number } & SessionEvents[K];

type HandledEvent = { [K in HandledType]: EventOf<K> }[HandledType];

/** Events the session reads; `started` is a server event it does not display. */
export type SessionEvent = HandledEvent | { type: 'started'; at?: number };

export function createSessionState({ entry }: { entry: string }): SessionState {
  return {
    entry,
    device: null,
    running: [],
    feed: [],
    seq: 0,
    epoch: 0,
    revision: 0,
    edit: null,
    devices: [],
    app: 'idle',
    logs: false,
    help: false,
    url: null,
    picker: null,
    stopped: false,
  };
}

function append(state: SessionState, item: NewFeedItem): SessionState {
  const id = state.seq + 1;

  return { ...state, seq: id, feed: [...state.feed, { id, ...item }] };
}

/** `device`'s entry replaced by `linked`, or added. */
function link(state: SessionState, linked: LinkedDevice): SessionState {
  const others = state.devices.filter(({ device }) => device.id !== linked.device.id);

  return { ...state, devices: [...others, linked] };
}

const HANDLERS: {
  [K in HandledType]: (state: SessionState, event: EventOf<K>) => SessionState;
} = {
  target: (state, { device }) => append({ ...state, device }, { kind: 'title', device }),
  'step:start': (state, { id, label, detail }) => ({
    ...state,
    running: [...state.running, { id, label, detail }],
  }),
  'step:end': (state, { id, ok, ms, message, diagnostics }) => {
    const step = state.running.find((candidate) => candidate.id === id);

    if (!step) throw new Error(`Unknown step '${id}'`);

    return append(
      { ...state, running: state.running.filter((candidate) => candidate !== step) },
      { kind: 'step', label: step.label, ok, ms, message, diagnostics },
    );
  },
  connected: (state) =>
    append(
      { ...state, app: 'running' },
      { kind: 'live', entry: state.entry, device: state.device },
    ),
  app: (state, { status, crash, at }) =>
    append({ ...state, app: status }, { kind: 'app', status, crash, at }),
  // Live Patch server events
  ready: (state, { url }) => ({ ...state, url }),
  // The initial build is part of startup (the server's step), not an edit.
  patched: (state, { revision, ms, files, initial, delivered, at }) =>
    initial
      ? { ...state, revision, edit: null }
      : append(
          { ...state, revision, edit: { revision, files } },
          { kind: 'patch', ok: true, revision, ms, files, delivered, at },
        ),
  unchanged: (state, { ms, files, at }) => append(state, { kind: 'unchanged', ms, files, at }),
  rejected: (state, { diagnostics, files, ms, at }) =>
    append(state, { kind: 'patch', ok: false, diagnostics, files, ms, at }),
  'device:connected': (state, { device, at }) =>
    append(link(state, { device, status: 'connected' }), {
      kind: 'note',
      title: `${device.name} connected`,
      at,
    }),
  'device:disconnected': (state, { device, at }) =>
    append(
      { ...state, devices: state.devices.filter((linked) => linked.device.id !== device.id) },
      { kind: 'note', title: `${device.name} disconnected`, at },
    ),
  // A device acking a revision nobody edited (its first sync) updates only its line.
  'device:applied': (state, { device, revision, ms, latency, at }) => {
    const next = link(state, { device, status: 'applied', revision, ms, latency });

    return state.edit?.revision === revision
      ? append(next, {
          kind: 'applied',
          device: device.name,
          revision,
          ms,
          latency,
          files: state.edit.files,
          at,
        })
      : next;
  },
  'device:rejected': (state, { device, revision, code, message, at }) =>
    append(link(state, { device, status: 'rejected', revision, message }), {
      kind: 'refused',
      device: device.name,
      revision,
      code,
      message,
      at,
    }),
  error: (state, { source, message, at }) => append(state, { kind: 'error', source, message, at }),
  state: (state, { key, value, at }) =>
    append(state, { kind: 'note', title: `state ${key}`, meta: JSON.stringify(value), at }),
  debugger: (state, { title, at }) =>
    append(state, { kind: 'note', title: 'Chrome DevTools', meta: title, at }),
  recorded: (state, { device, file, truncated, at }) =>
    append(state, {
      kind: 'note',
      title: `Recording of ${device.name}`,
      meta: file + (truncated ? ' (stopped at its size limit)' : ''),
      at,
    }),
  log: (state, { stream, text, source = 'server', at }) =>
    append(state, { kind: 'log', source, stream, text, at }),
  console: (state, { level, message, file, line, column, at }) =>
    append(state, { kind: 'console', level, message, file, line, column, at }),
  placement: (state, { files, at }) => append(state, { kind: 'placement', files, at }),
  // Session controls
  pick: (state, { devices, message }) => ({ ...state, picker: { devices, message } }),
  picked: (state) => ({ ...state, picker: null }),
  logs: (state, { on }) =>
    append(
      { ...state, logs: on },
      { kind: 'note', title: on ? 'Device logs on' : 'Device logs off' },
    ),
  help: (state) => ({ ...state, help: !state.help }),
  clear: (state) => ({ ...state, feed: [], epoch: state.epoch + 1 }),
  stopped: (state) =>
    append(
      { ...state, stopped: true, running: [], picker: null },
      { kind: 'note', title: 'Stopped' },
    ),
};

const handles = (event: SessionEvent): event is HandledEvent => Object.hasOwn(HANDLERS, event.type);

function reduceWith<K extends HandledType>(state: SessionState, event: EventOf<K>): SessionState {
  const handler = HANDLERS[event.type];

  return handler(state, event);
}

/** Unknown event types (e.g. server events the CLI does not display) leave state untouched. */
export function reduceSession(state: SessionState, event: SessionEvent): SessionState {
  return handles(event) ? reduceWith(state, event) : state;
}
