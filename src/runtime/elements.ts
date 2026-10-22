import { sendEvent, type KernelEvent } from './events';
import { setViewProp } from './flatten';
import { hostCommand } from './host';
import { isModuleKind, moduleViewMethods } from './modules';
import { isScrollingKind, scrollMethods } from './scrolling';
import { elements, views } from './state/views';

type Listener = (event: KernelEvent) => unknown;

interface AbortSignalLike {
  aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

type ListenerOptions = boolean | { capture?: boolean; once?: boolean; signal?: AbortSignalLike };

export interface ListenerRecord {
  type: string;
  fn: Listener;
  capture: boolean;
  once: boolean;
  signal?: AbortSignalLike;
  abort?: () => void;
}

/** A view's element: a logical EventTarget backed by its native view ID, not a DOM node. */
export interface ElementHandle {
  readonly id: string;
  readonly parent: ElementHandle | null;
  readonly children: ElementHandle[];
  readonly listeners: ListenerRecord[];
  setProperty(key: string, value: unknown): void;
  focus(): void;
  blur(): void;
  addEventListener(type: string, fn: Listener, options?: ListenerOptions): void;
  removeEventListener(type: string, fn: Listener, options?: ListenerOptions): void;
  dispatchEvent(event: KernelEvent): boolean;
  /** Removes every listener when the view is removed. */
  clear(): void;
}

function isCapture(options: ListenerOptions | undefined): boolean {
  return options === true || (typeof options === 'object' && !!options.capture);
}

/**
 * The element of view number `id`, which the app knows by its label; a
 * scrolling view adds scrollTo and scrollToEnd, a module's view the
 * functions it declares.
 */
export function makeHandle(id: number, label: string, kind: string): ElementHandle {
  const listeners: ListenerRecord[] = [];
  const handle: ElementHandle = {
    id: label,
    get parent() {
      const parent = views.get(id)?.parent ?? null;

      return parent === null ? null : (elements.get(parent) ?? null);
    },
    get children() {
      return (views.get(id)?.children ?? []).flatMap((child) => elements.get(child) ?? []);
    },
    listeners,
    setProperty(key, value) {
      if (!views.has(id)) throw Error('Detached native element');

      setViewProp(id, key, value);
    },
    focus: () => hostCommand(id, 'focus'),
    blur: () => hostCommand(id, 'blur'),
    addEventListener(type, fn, options) {
      if (typeof fn !== 'function') throw TypeError('Listener must be a function');

      const capture = isCapture(options);

      if (listeners.some((x) => x.type === type && x.fn === fn && x.capture === capture)) return;

      const settings = typeof options === 'object' ? options : {};
      const record: ListenerRecord = { type, fn, capture, once: !!settings.once };
      const signal = settings.signal;

      if (signal) {
        if (signal.aborted) return;

        record.signal = signal;
        record.abort = () => handle.removeEventListener(type, fn, capture);
        signal.addEventListener('abort', record.abort, { once: true });
      }

      listeners.push(record);
    },
    removeEventListener(type, fn, options) {
      const capture = isCapture(options);

      listeners.slice().forEach((record) => {
        if (record.type !== type || record.fn !== fn || record.capture !== capture) return;

        listeners.splice(listeners.indexOf(record), 1);

        if (record.abort) record.signal?.removeEventListener('abort', record.abort);
      });
    },
    dispatchEvent: (event) => sendEvent(id, event),
    clear() {
      listeners.slice().forEach((record) => {
        handle.removeEventListener(record.type, record.fn, record.capture);
      });
    },
  };

  if (isScrollingKind(kind))
    Object.assign(
      handle,
      scrollMethods(id, () => views.has(id)),
    );

  if (isModuleKind(kind))
    Object.assign(
      handle,
      moduleViewMethods(kind, id, label, () => views.has(id)),
    );

  return handle;
}
