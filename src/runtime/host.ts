import { keyDiff } from './key-diff';
import { queueOperation } from './operations';
import { isModuleKind } from './modules';
import { EVERY_KIND_PROPS, KEY_PROPS } from './protocol.generated';
import { devtools } from './state/devtools';
import { threads } from './state/threads';
import { moduleViews, sentValues } from './state/views';
import { rememberEntry } from './transaction';
import { noteCause } from './update-causes';
import { dict, isPlainData, own, sameData } from './values';
import { labelOf } from './view-ids';
import {
  writeCommand,
  writeCreate,
  writeFlatten,
  writeKeys,
  writeMove,
  writeProp,
  writeRemove,
} from './wire';

/**
 * The native host's side of the boundary. View mutations cross as one batch
 * per job (src/runtime/wire.ts); the rest are scalars, structured values plain data.
 * Optional members exist only on some hosts.
 */
declare global {
  var __kuitoHostSetTimer: ((id: number, delay: number, callback: () => void) => void) | undefined;
  var __kuitoHostClearTimer: ((id: number) => void) | undefined;
  /**
   * The platform's HTTP client (native/shared/Http.h). Headers cross as
   * `[name, value, …]`; answers come back through `__kuitoHttpHead`,
   * `__kuitoHttpChunk` (after `stream`) and `__kuitoHttpEnd`.
   */
  var __kuitoHostHttp:
    | {
        start(
          id: number,
          request: {
            url: string;
            method: string;
            headers: string[];
            /** A file URI the body is written to, replacing it, when the status is 2xx. */
            saveTo?: string;
            /** Report `__kuitoHttpProgress` for the bytes sent, or received. */
            progress?: 'send' | 'receive';
          },
          /** `file` is a file URI the body streams from, after `prefix` and before `suffix`. */
          body:
            | string
            | ArrayBuffer
            | { file: string; prefix?: ArrayBuffer; suffix?: ArrayBuffer }
            | undefined,
        ): void;
        /** Send the rest of the body as chunks instead of whole at the end. */
        stream(id: number): void;
        cancel(id: number): void;
      }
    | undefined;
  /**
   * The platform's WebSocket client (native/shared/Socket.h); answers come
   * back through `__kuitoSocketOpen`, `Message`, `Error` and `Close`.
   */
  var __kuitoHostSocket:
    | {
        open(id: number, url: string, protocols: string[]): void;
        send(id: number, data: string | ArrayBuffer): void;
        close(id: number, code: number, reason: string): void;
      }
    | undefined;
  /** Fills `length` bytes of `buffer` from `offset` with the platform's CSPRNG. */
  var __kuitoHostFillRandom:
    | ((buffer: ArrayBuffer, offset: number, length: number) => void)
    | undefined;
  /** Milliseconds since the runtime started, on a monotonic clock. */
  var __kuitoHostNow: (() => number) | undefined;
  var __kuitoHostEncodeUtf8: ((text: string) => ArrayBuffer) | undefined;
  /** Invalid sequences decode as U+FFFD. */
  var __kuitoHostDecodeUtf8:
    | ((buffer: ArrayBuffer, offset: number, length: number) => string)
    | undefined;
  /**
   * A motion value as the UI thread last saw it, `{ value, js }` with the JS
   * write it includes; undefined before it has one. Hosts with a UI runtime.
   */
  var __kuitoHostMotionRead: ((id: string) => unknown) | undefined;
  /**
   * A motion value's number, if the UI thread mirrored one that includes JS
   * write `version`; null when it has not caught up, undefined when the value
   * is not a number (read it whole).
   */
  var __kuitoHostMotionNumber:
    | ((id: string, version: number) => number | null | undefined)
    | undefined;
  /**
   * The UI thread's last frame ended with batches still to apply
   * (native/shared/FrameHandoff.h); the app event `host.idle` follows when
   * it catches up. Hosts with a frame handoff.
   */
  var __kuitoHostBusy: (() => boolean) | undefined;
  /** Set before the kernel loads when the OS launched the app for a background task. */
  var __kuitoHostHeadless: boolean | undefined;
}

export const host = globalThis;

/** A one-shot instruction (focus, dismiss the keyboard) for view `id`, or 0 for the app. */
export function hostCommand(id: number, name: string, argument = ''): void {
  writeCommand(id, name, argument);
}

/** `{ target, __kuitoAnimation }`, from timing, spring and the rest (animation-specs.ts). */
export interface AnimatedValue {
  target?: unknown;
  __kuitoAnimation: unknown;
  onEnd?: unknown;
}

export function isAnimatedValue(value: unknown): value is AnimatedValue {
  return isPlainData(value) && own(value, '__kuitoAnimation');
}

/** Views cross the host boundary by number; 0 is the screen's root. */
export function createHostView(
  view: { id: number; kind: string; parent: number | null },
  flattened: boolean,
): void {
  writeCreate(view.id, view.parent ?? 0, view.kind, labelOf(view.id), flattened);

  rememberEntry(moduleViews, view.id);

  if (isModuleKind(view.kind)) moduleViews.set(view.id, true);
  else moduleViews.delete(view.id);
}

export function removeHostView(id: number): void {
  writeRemove(id);
}

export function moveHostView(id: number, parent: number | null, index: number): void {
  writeMove(id, parent ?? 0, index);
}

export function setHostFlattened(id: number, flattened: boolean): void {
  writeFlatten(id, flattened);
}

/** The entries of `id` in `table`, journaled first so an aborted commit restores them. */
function entriesOf<T>(table: Map<number, Record<string, T>>, id: number): Record<string, T> {
  rememberEntry(table, id, copyEntries);

  const entries = table.get(id) ?? dict<T>();

  table.set(id, entries);

  return entries;
}

/** A key prop's value: the list's keys. */
function keyList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((key) => typeof key === 'string'))
    throw new TypeError('Native prop ' + name + ' takes an array of strings');

  return value;
}

/**
 * A UI-thread binding binds the prop there; a later plain value unbinds it.
 * Object values equal to the last one sent are not sent again; a key prop
 * sends its edits to the keys sent last. Animations reach here as bindings
 * (src/runtime/prop-animation.ts).
 */
export function sendProp(id: number, name: string, value: unknown): void {
  const structured = typeof value === 'object' && value !== null;
  const sent = entriesOf(sentValues, id);
  const last = sent[name];

  if (structured && own(sent, name) && sameData(last, value)) return;

  const edits =
    structured && own(KEY_PROPS, name)
      ? keyDiff(last === undefined ? [] : keyList(last, name), keyList(value, name))
      : null;

  noteCause(id, name);

  if (structured) sent[name] = value;
  else delete sent[name];

  const bound = entriesOf(threads.boundProps, id);

  if (isUIBinding(value)) {
    queueOperation({ op: 'bind', view: id, prop: name, source: value.__kuitoUIBinding });
    bound[name] = true;

    return;
  }

  if (bound[name]) {
    queueOperation({ op: 'unbind', view: id, prop: name });
    delete bound[name];
  }

  if (edits !== null) writeKeys(id, name, edits);
  else writeProp(id, name, value, ownProp(id, name));
}

/**
 * A module view's own prop, which crosses by name: the manifest's prop of
 * that name belongs to other kinds, and C++ would check it as theirs (a
 * TextField's `type` against a DatePicker's).
 */
function ownProp(id: number, name: string): boolean {
  return moduleViews.has(id) && !own(EVERY_KIND_PROPS, name);
}

/**
 * A prop the view changed itself and reported (src/runtime/events.ts): the
 * value it shows is the one sent, so writing it again sends nothing, and
 * writing the value before it sends that.
 */
export function noteShown(id: number, name: string, value: unknown): void {
  const sent = entriesOf(sentValues, id);

  if (typeof value === 'object' && value !== null) sent[name] = value;
  else delete sent[name];
}

/**
 * A field's text and selection as a format on the JS thread made them from
 * the user's edit (docs/keyboard.md#formatting): written to the field past
 * any UI-thread binding of its text, and remembered as shown.
 */
export function showEdit(
  id: number,
  text: string,
  selection: { start: number; end: number },
): void {
  noteCause(id, 'text');
  writeProp(id, 'text', text);
  noteShown(id, 'selection', selection);
  writeProp(id, 'selection', selection);
}

const copyEntries = <T>(entries: Record<string, T>) => Object.assign(dict<T>(), entries);

/** A prop computed on the UI thread; `__kuitoUIBinding` is its encoded source. */
export interface UIBinding {
  __kuitoUIBinding: unknown;
}

export function isUIBinding(value: unknown): value is UIBinding {
  return isPlainData(value) && own(value, '__kuitoUIBinding');
}

/** A removed view's UI-thread bindings go with it. */
export function forgetView(id: number): void {
  const bound = threads.boundProps.get(id);

  rememberEntry(threads.boundProps, id);
  rememberEntry(sentValues, id);
  rememberEntry(moduleViews, id);
  threads.boundProps.delete(id);
  sentValues.delete(id);
  moduleViews.delete(id);
  devtools.causes.delete(id);

  Object.keys(bound ?? {}).forEach((prop) => {
    queueOperation({ op: 'unbind', view: id, prop });
  });
}
