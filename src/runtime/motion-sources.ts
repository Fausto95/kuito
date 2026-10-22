// Motion sources (docs/motion.md#motion-sources): the motion values a native
// view moves every frame, one per field of its `motion` event's payload. The
// app passes one to the view's `motion` prop; the view's event writes them on
// the UI thread, and here only when it reaches this thread.
import type { EventHandler, KernelEvent } from './events';
import { hasUIThread, queueOperation } from './operations';
import { EVENT_LAYOUTS, EVENT_RECORDS } from './protocol.generated';
import { handlers } from './state/modules';
import type { MotionHandle } from './state/motion';
import { threads } from './state/threads';
import { freeMotion, platformMotion } from './motion-values';
import { own, type PlainData } from './values';

/** What the app calls for each payload, and the views that take one. */
const CREATORS: Readonly<Record<string, { name: string; views: string }>> = Object.freeze({
  ScrollMotionPayload: { name: 'scrollMotion()', views: "a Scroll's or a List's" },
  SheetMotionPayload: { name: 'sheetMotion()', views: "a Sheet's" },
  BackMotionPayload: { name: "a stack's back motion", views: "the Router's stacks'" },
});

interface Source {
  layout: number;
  name: string;
  fields: Record<string, { id: string; handle: MotionHandle; set(value: unknown): void }>;
  /** Moves the fields from an event that reached this thread: one per source, so it names it. */
  handler: EventHandler;
}

const sources = new WeakMap<object, Source>();
const handlerSources = new WeakMap<EventHandler, Source>();

/** The payload layout `kind`'s motion event writes; null for a kind without one. */
function layoutOf(kind: string): number | null {
  const kinds = EVENT_RECORDS.motion;

  return own(kinds, kind) ? kinds[kind] : null;
}

/** A new source for views of `kind`: its fields, each a motion value only the platform writes. */
export function createMotionSource(kind: string): Readonly<Record<string, MotionHandle>> {
  const layout = layoutOf(kind);
  const spec = layout === null ? null : EVENT_LAYOUTS[layout];

  if (layout === null || !spec) throw new TypeError(kind + ' has no motion source');

  const name = CREATORS[spec.name].name;
  const fields: Source['fields'] = {};
  const object: Record<string, MotionHandle> = {};

  spec.numbers.forEach(([field]) => {
    const id = 'm' + ++threads.nextMotion;
    const motion = platformMotion(
      id,
      name + '.' + field,
      () => queueOperation({ op: 'linked', id, value: 0 }),
      0,
    );

    fields[field] = { id, ...motion };
    object[field] = motion.handle;
  });

  const source: Source = {
    layout,
    name,
    fields,
    handler: (event: KernelEvent) =>
      Object.keys(fields).forEach((field) => {
        if (typeof event[field] === 'number') fields[field].set(event[field]);
      }),
  };

  Object.freeze(object);
  sources.set(object, source);
  handlerSources.set(source.handler, source);

  return object;
}

/** Its motion values go on both threads. */
export function freeMotionSource(value: unknown): void {
  const source = typeof value === 'object' && value !== null ? sources.get(value) : undefined;

  if (!source) return;

  Object.keys(source.fields).forEach((field) => freeMotion(source.fields[field].handle));
}

/**
 * `value`, a view's `motion` prop, as the handlers its event needs: one
 * for the UI thread, naming the motion value of each field, and this
 * thread's. None for null or undefined: the view sends nothing.
 */
export function attachMotionSource(
  kind: string,
  value: unknown,
): { ui: PlainData | null; js: EventHandler } | null {
  const layout = layoutOf(kind);
  const source = typeof value === 'object' && value !== null ? sources.get(value) : undefined;

  if (layout === null)
    throw new TypeError(
      kind +
        ' has no motion source: motion is ' +
        Object.keys(CREATORS)
          .map((payload) => CREATORS[payload].views)
          .join(', or '),
    );

  if (value == null) return null;

  if (!source || source.layout !== layout)
    throw new TypeError(kind + ' motion takes ' + CREATORS[EVENT_LAYOUTS[layout]?.name ?? ''].name);

  if (!hasUIThread()) return { ui: null, js: source.handler };

  const motion: Record<string, string> = {};

  Object.keys(source.fields).forEach((field) => {
    motion[field] = source.fields[field].id;
  });

  return { ui: { motion }, js: source.handler };
}

/**
 * Before a plan commits: no source may move with two views once its
 * handlers, `next`, replace the committed ones it plans again, `leaving`.
 * Two views writing one source would make its values jump between them.
 */
export function checkMotionSources(
  next: Readonly<Record<string, EventHandler>>,
  leaving: readonly string[],
): void {
  const planned = Object.keys(next).filter((key) => handlerSources.has(next[key]));

  if (!planned.length) return;

  const gone = new Set(leaving);
  const holders = new Map<Source, string[]>();
  const hold = (key: string, handler: EventHandler) => {
    const source = handlerSources.get(handler);

    if (source) holders.set(source, [...(holders.get(source) ?? []), key]);
  };

  Object.keys(handlers).forEach((key) => {
    if (!gone.has(key) && !own(next, key)) hold(key, handlers[key].invoke);
  });

  planned.forEach((key) => hold(key, next[key]));

  holders.forEach((keys, source) => {
    if (keys.length > 1)
      throw new TypeError(
        source.name +
          ' moves with one view at a time: ' +
          keys.map((key) => key.slice(0, key.lastIndexOf('.'))).join(' and '),
      );
  });
}
