// A view's gestures prop: the recognizers the native side runs (the native
// `gestures` prop, docs/motion.md) and what their events do: callbacks, on
// the UI thread when there is one, and the motion values following them.
import type { EventHandler, KernelEvent } from './events';
import { createGestureDispatcher, type DispatchedGesture } from './gesture-events';
import {
  isGesture,
  prepareGestures,
  race,
  type Composable,
  type Gesture,
  type PreparedGesture,
} from './gesture-specs';
import { hasUIThread } from './operations';
import { gestureCount, gestureTags } from './state/gestures';
import type { Rebind } from './state/threads';
import { encodeCallback } from './threads';
import { encodeForUI } from './thread-encoding';
import { gestureId, jsFollowers } from './motion-values';
import { rememberEntry } from './transaction';
import { dict, isFunction, own, type PlainData } from './values';

/**
 * One tag per view and place in its composition: a re-render that makes new
 * gesture values never restarts a gesture in flight.
 */
function tagFor(view: number, place: string): number {
  const tags = gestureTags.get(view);

  if (tags && own(tags, place)) return tags[place];

  const tag = ++gestureCount.next;

  rememberEntry(gestureTags, view);
  gestureTags.set(view, Object.assign(dict<number>(), tags, { [place]: tag }));

  return tag;
}

/** A removed view's gesture tags go with it; the remotes its callbacks held go with its module's next plan. */
export function forgetGestures(view: number): void {
  rememberEntry(gestureTags, view);
  gestureTags.delete(view);
}

export interface AttachedGesture {
  /** The native `gestures` prop. */
  native: PlainData[];
  /** UI-thread handler fields, when there is a UI runtime. */
  ui: PlainData | null;
  /** The JS-thread handler, when there is not. */
  js: EventHandler | null;
}

/** Each gesture's place in the composition: its path and kind. */
function places(root: Composable): Map<Gesture, string> {
  const found = new Map<Gesture, string>();
  const visit = (gesture: Composable, path: string) => {
    if (gesture.__kuitoGesture === 'gesture') return void found.set(gesture, path + gesture.kind);

    gesture.gestures.forEach((child, index) => visit(child, path + index + '.'));
  };

  visit(root, '');

  return found;
}

/** A view's gestures prop: a list of gesture values, which race. Null when it has none. */
export function attachGestures(
  viewKind: string,
  viewId: number,
  value: unknown,
  rebinds: Rebind[],
): AttachedGesture | null {
  if (value === undefined || value === null) return null;

  const list: unknown[] = Array.isArray(value) ? value : [value];

  if (!list.every(isGesture))
    throw new TypeError(
      viewKind +
        ' gestures takes gestures such as pan() or tap(), composed with race, together or orElse',
    );

  if (!list.length) return null;

  const root = list.length === 1 ? list[0] : race(...list);
  const placed = places(root);
  const prepared = prepareGestures(root, (gesture) => tagFor(viewId, String(placed.get(gesture))));
  const native = prepared.map(
    ({ tag, type, config, waitFor, simultaneousHandlers, blocksHandlers }) => ({
      tag,
      type,
      config,
      waitFor,
      simultaneousHandlers,
      blocksHandlers,
    }),
  );

  if (hasUIThread())
    return {
      native,
      ui: { gestures: prepared.map((entry) => encodeGesture(viewKind, entry, rebinds)) },
      js: null,
    };

  const dispatch = createGestureDispatcher(
    prepared.map((entry) => dispatched(entry, entry.gesture.callbacks)),
    jsFollowers,
  );

  return { native, ui: null, js: (event: KernelEvent) => dispatch(event) };
}

function dispatched(
  entry: PreparedGesture,
  callbacks: DispatchedGesture['callbacks'],
): DispatchedGesture {
  const { gesture } = entry;

  return {
    tag: entry.tag,
    type: entry.type,
    kind: gesture.kind,
    gesture: gestureId(gesture),
    callbacks,
    ...(gesture.releasing && { releasing: gesture.releasing }),
  };
}

/** A gesture for the UI thread: each callback placed on its own, the release as data. */
function encodeGesture(viewKind: string, entry: PreparedGesture, rebinds: Rebind[]): PlainData {
  const callbacks: PlainData = {};

  Object.entries(entry.gesture.callbacks).forEach(([name, callback]) => {
    if (!isFunction(callback)) return;

    callbacks[name] = encodeCallback(viewKind, entry.gesture.kind + ' ' + name, callback, {
      key: entry.tag + ':' + name,
      rebinds,
    });
  });

  const { releasing, ...rest } = dispatched(entry, {});

  return {
    ...rest,
    callbacks,
    ...(releasing !== undefined && { releasing: encodeForUI(releasing) }),
  };
}
