// The Components panel's backend (docs/devtools.md): Kuito's own model,
// signal → binding → view, carried by the inspector's `panel` frames. The
// graph itself is src/runtime/devtools-graph.ts; this module answers the
// panel's messages (src/runtime/devtools-protocol.ts) and drives the device's
// outlines and its tap to select.
import {
  componentDetails,
  findInstance,
  findSignal,
  instances,
  ownerOf,
  componentId,
  signalDetails,
  topViews,
  tree,
  viewDetails,
} from './devtools-graph';
import type { KernelMessage, PanelMessage } from './devtools-protocol';
import { setViewProp } from './flatten';
import { host, hostCommand } from './host';
import { devtools } from './state/devtools';
import { gestureTags } from './state/gestures';
import { handlers, stateStore } from './state/modules';
import { motions } from './state/motion';
import { signalBatch } from './state/signals';
import { noWork, stats, type KernelWork } from './state/stats';
import { threads } from './state/threads';
import { views } from './state/views';
import { own, type PlainData } from './values';
import { history, recordWrite } from './write-log';
import { holding } from './wire';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

declare global {
  /** Development builds with an inspector: a message for the Components panel, as JSON. */
  var __kuitoHostDevtools: ((message: string) => void) | undefined;
  var __kuitoDevtools: { receive(message: string): void } | undefined;
}

function send(message: KernelMessage): void {
  host.__kuitoHostDevtools?.(JSON.stringify(message));
}

/** On a host with an inspector, the panel can reach this runtime; it learns of a new one at once. */
export function installDevtools(): void {
  if (typeof host.__kuitoHostDevtools !== 'function') return;

  host.__kuitoDevtools = Object.freeze({ receive });
  // Signal writes travel with what they start, so an update can name its cause.
  signalBatch.causes = new Map();
  signalBatch.onWrite = recordWrite;
  send({ event: 'hello' });
  // The shell answers with `devtools.updates`: whether it highlights updates.
  hostCommand(0, 'devtoolsHello');
}

/** The panel's tree made equal to the app's, if it changed. */
function syncTree(): void {
  devtools.scheduled = false;
  if (!devtools.connected) return;

  const components = tree();
  const json = JSON.stringify(components);

  if (json === devtools.tree) return;

  devtools.tree = json;
  send({ event: 'tree', payload: { components } });
}

/** A module was planned or disposed: the panel hears at the end of the task. */
export function modulesChanged(): void {
  if (!__KUITO_DEV__) return;
  if (!devtools.connected || devtools.scheduled) return;

  devtools.scheduled = true;
  void Promise.resolve().then(syncTree);
}

function highlight(views: number[]): void {
  hostCommand(0, 'devtoolsHighlight', JSON.stringify(views));
}

function inspecting(on: boolean): void {
  if (devtools.inspecting === on) return;

  devtools.inspecting = on;
  hostCommand(0, 'devtoolsInspect', on ? 'on' : 'off');
}

/** A tap while the panel inspects: `select` names the view under it by number. */
function select(payload: PlainData): void {
  const { view } = payload;

  if (!devtools.inspecting || typeof view !== 'number' || !views.has(view)) return;

  const owner = ownerOf(view);
  const instance = owner === null ? undefined : instances().find((each) => each.key === owner);

  inspecting(false);
  highlight([view]);

  send({
    event: 'selected',
    payload: { view, component: instance ? componentId(instance.key) : null },
  });
}

/** The shell's devtools events (handle 0, `devtools.<type>`). */
const EVENTS: Record<string, (payload: PlainData) => void> = {
  select,
  // The highlighter was turned on or off, or a new runtime asked.
  updates: ({ on }) => {
    devtools.updates = on === true;
  },
};

export function devtoolsEvent(type: string, payload: PlainData): void {
  if (__KUITO_DEV__ && own(EVENTS, type)) EVENTS[type](payload);
}

type Payload<E extends PanelMessage['event']> =
  Extract<PanelMessage, { event: E }> extends { payload: infer P } ? P : undefined;

/** What each field of each message must be: the panel's messages are checked before use. */
const FIELDS: { [E in PanelMessage['event']]: Record<keyof Payload<E> & string, string> } = {
  connect: {},
  shutdown: {},
  inspectComponent: { id: 'number' },
  inspectView: { view: 'number' },
  inspectSignal: { signal: 'number' },
  highlightComponent: { id: 'number' },
  highlightView: { view: 'number' },
  clearHighlight: {},
  startInspecting: {},
  stopInspecting: {},
  setSignal: { signal: 'number', value: 'unknown' },
  setProp: { view: 'number', prop: 'string', value: 'unknown' },
  setMotion: { motion: 'string', value: 'unknown' },
  history: {},
};

/** An edit runs as app code would, its writes sent as one batch. */
function edit(work: () => void): void {
  holding(work);
}

const MESSAGES: { [E in PanelMessage['event']]: (payload: Payload<E>) => void } = {
  // The panel's page connected or came back: it starts from an empty tree.
  connect: () => {
    devtools.connected = true;
    devtools.tree = '';
    syncTree();
  },
  shutdown: () => {
    devtools.connected = false;
    inspecting(false);
  },
  inspectComponent: ({ id }) => {
    const instance = findInstance(id);

    send({ event: 'component', payload: instance ? componentDetails(instance) : null });
  },
  inspectView: ({ view }) => send({ event: 'view', payload: viewDetails(view) }),
  inspectSignal: ({ signal }) => {
    const found = findSignal(signal);

    send({ event: 'signal', payload: found ? signalDetails(found) : null });
  },
  highlightComponent: ({ id }) => {
    const instance = findInstance(id);

    highlight(instance ? topViews(instance) : []);
  },
  highlightView: ({ view }) => highlight(views.has(view) ? [view] : []),
  clearHighlight: () => highlight([]),
  startInspecting: () => inspecting(true),
  stopInspecting: () => inspecting(false),
  setSignal: ({ signal, value }) => {
    const found = findSignal(signal);

    if (!found) throw new Error('No signal ' + signal + ' in this runtime');

    // A plain write, as app code makes: bindings and structure follow.
    edit(() => {
      if (!Reflect.set(found, 'value', value)) throw new Error('A computed signal is read-only');
    });
  },
  // Until the prop's binding next writes it.
  setProp: ({ view, prop, value }) => {
    if (!views.has(view)) throw new Error('No view ' + view + ' in this runtime');
    edit(() => setViewProp(view, prop, value));
  },
  history: () => send({ event: 'history', payload: history() }),
  setMotion: ({ motion, value }) => {
    if (!own(motions, motion)) throw new Error('No motion value ' + motion + ' in this runtime');

    edit(() => {
      motions[motion].handle.value = value;
    });
  },
};

/** `parsed` as the message it names, or why it is not one. */
function parse(parsed: unknown): PanelMessage {
  if (typeof parsed !== 'object' || parsed === null || !('event' in parsed))
    throw new Error('A panel message is an object with an event');

  const { event } = parsed;

  if (typeof event !== 'string' || !own(FIELDS, event))
    throw new Error('Unknown panel message ' + String(event));

  const fields: Record<string, string> = FIELDS[event as PanelMessage['event']];
  const names = Object.keys(fields);

  if (!names.length) return { event } as never;

  const payload = 'payload' in parsed ? parsed.payload : undefined;

  if (typeof payload !== 'object' || payload === null)
    throw new Error('Panel message ' + event + ' needs a payload');

  names.forEach((name) => {
    const value: unknown = Reflect.get(payload, name);

    if (fields[name] !== 'unknown' && typeof value !== fields[name])
      throw new Error('Panel message ' + event + ' needs ' + name + ' as a ' + fields[name]);
  });

  return { event, payload } as never;
}

function receive(message: string): void {
  try {
    const parsed = parse(JSON.parse(message));
    // parse() checked the payload against the event's fields.
    const answer: (payload: never) => void = MESSAGES[parsed.event];

    answer(('payload' in parsed ? parsed.payload : undefined) as never);
  } catch (error) {
    send({
      event: 'refused',
      payload: { message: error instanceof Error ? error.message : String(error) },
    });
  }
}

// --- Counters ----------------------------------------------------------------

const WORK = Object.keys(noWork()) as (keyof KernelWork)[];

function copyWork(work: KernelWork): KernelWork {
  const copy = noWork();

  WORK.forEach((name) => {
    copy[name] = work[name];
  });

  return copy;
}

/** Marks the start of a patch(); `replanned` takes the mark when it commits. */
export function replanStarted(): KernelWork {
  return copyWork(stats.total);
}

/** A plan committed: the stats take its work, and the panel its tree. */
export function replanned(start: KernelWork): void {
  stats.replans++;
  modulesChanged();

  WORK.forEach((name) => {
    stats.lastReplan[name] = stats.total[name] - start[name];
  });
}

/** What the kernel holds now, by store: each stays flat while the app does. */
export interface KernelHeld {
  states: number;
  motions: number;
  remotes: number;
  signals: number;
  gestureTags: number;
  views: number;
  handlers: number;
}

function held(): KernelHeld {
  return {
    states: Object.keys(stateStore).length,
    motions: Object.keys(motions).length,
    remotes: threads.remotes.size,
    signals: threads.signals.size,
    gestureTags: [...gestureTags.values()].reduce(
      (count, tags) => count + Object.keys(tags).length,
      0,
    ),
    views: views.size,
    handlers: Object.keys(handlers).length,
  };
}

/** `__kuito.stats()`: a snapshot, so a caller can diff two of them around an interaction. */
export function kernelStats(): {
  replans: number;
  total: KernelWork;
  lastReplan: KernelWork;
  held: KernelHeld;
} {
  return {
    replans: stats.replans,
    total: copyWork(stats.total),
    lastReplan: copyWork(stats.lastReplan),
    held: held(),
  };
}
