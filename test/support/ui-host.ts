// The UI-thread kernel (src/ui-thread) in a node:vm context, with a fake host
// that records what it would send to native views and to the JS thread.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { UI_KERNEL_OUTPUT } from '../../src/dev/kernel.ts';

export interface UIKernel {
  receive(operations: unknown[]): void;
  event(handle: number, type: string, payload: string): boolean;
  /** A typed event: its numbers in `eventNumbers`, its strings passed. */
  eventRecord(handle: number, type: string, layout: number, strings?: string[]): boolean;
  readonly eventNumbers: Float64Array;
  /** A display frame at `now` milliseconds. */
  frame(now: number): void;
  /** A module's motion value the platform set. */
  platform(member: number, value: unknown): void;
  /** What the UI kernel holds now, by store. */
  stats(): { functions: number; motions: number; handlers: number; bindings: number };
  /** Its work counters, live: what a shell reads after each call. */
  readonly work: { readonly jsonParses: number; readonly bytesStringified: number };
}

export interface UIHost {
  ui: UIKernel;
  /** Props written to native views, in order: `[view, prop, value]`. */
  props: Array<[number, string, unknown]>;
  /** Messages for the JS thread, each a copy as C++ makes one. */
  sent: unknown[];
  /** The latest value of each motion value, as JS-thread reads see it. */
  mirror: Map<string, unknown>;
  /** The motion values mirrored whole, in order: numbers cross as numbers. */
  wholeMirrors: string[];
  logs: Array<[string, string]>;
  /** How many frames the UI kernel asked for. */
  requested: { frames: number };
  send(...messages: object[]): void;
  load(code: string): void;
}

const source = () => readFileSync(UI_KERNEL_OUTPUT, 'utf8');

const isUIKernel = (value: unknown): value is UIKernel =>
  typeof value === 'object' &&
  value !== null &&
  'receive' in value &&
  'event' in value &&
  'eventRecord' in value &&
  'frame' in value &&
  'platform' in value;

/** `globals` adds to the fake host, like an attached inspector's. */
export function installUIKernel(globals: object = {}): UIHost {
  const props: UIHost['props'] = [];
  const sent: unknown[] = [];
  const mirror = new Map<string, unknown>();
  const wholeMirrors: string[] = [];
  const logs: UIHost['logs'] = [];
  const requested = { frames: 0 };
  const context = createContext({
    __kuitoUISetProp(view: number, prop: string, value: unknown) {
      props.push([view, prop, value]);
    },
    __kuitoUISendEvent(message: object) {
      sent.push(structuredClone(message));
    },
    __kuitoUIMirror(id: string, value: unknown, js: number) {
      wholeMirrors.push(id);
      mirror.set(id, structuredClone({ value, js }));
    },
    __kuitoUIMirrorNumber(id: string, value: number, js: number) {
      mirror.set(id, { value, js });
    },
    __kuitoUILog(level: string, message: string) {
      logs.push([level, message]);
    },
    __kuitoUIRequestFrame() {
      requested.frames++;
    },
    // Stopped: no test's frame runs over its budget unless it moves the clock.
    __kuitoUINow: () => 0,
    ...globals,
  });

  runInContext(source(), context);

  const ui: unknown = runInContext('globalThis.__kuitoUI', context);

  if (!isUIKernel(ui)) throw new Error('The UI kernel did not install __kuitoUI');

  return {
    ui,
    props,
    sent,
    mirror,
    wholeMirrors,
    logs,
    requested,
    send: (...messages) => ui.receive(structuredClone(messages)),
    load: (code) => runInContext(code, context),
  };
}
