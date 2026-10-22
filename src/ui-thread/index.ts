/*
 * The UI-thread kernel. It runs in a Hermes runtime of its own on the platform
 * UI thread, next to the views: props bound to motion values, and the event
 * handlers that write them, run here without waiting for the JS thread.
 *
 * The JS-thread kernel sends operations as JSON (see operations.ts); UI-thread
 * functions come from the UI bundle the compiler emits (src/dev/threads),
 * which registers each one with `define`.
 *
 * Props computed on the UI thread from motion values are Reanimated's mappers
 * (https://github.com/software-mansion/react-native-reanimated,
 * src/mappers.native.ts), MIT License, Copyright (c) 2016 Software Mansion.
 * Unlike Reanimated, a binding's dependencies are the values it read on its
 * last run, as with Kuito's signals, not every value it captured.
 */
import { flush } from './bindings';
import { measured } from './budget';
import { installConsole } from './console';
import { jsonEvent, recordEvent } from './events';
import { EVENT_LAYOUT_HASH } from '../runtime/protocol.generated';
import { frame } from './frames';
import { createMotion, writeMotion } from './motion';
import { applyOperation } from './operations';
import {
  bindings,
  defined,
  eventNumbers,
  functions,
  handlers,
  locations,
  motions,
  work,
  type Factory,
} from './state';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

declare global {
  var __kuitoUI:
    | {
        define(id: string, factory: Factory, location?: string): void;
        receive(operations: unknown): void;
        event(handle: number, type: string, payload: string): boolean;
        eventRecord(
          handle: number,
          type: string,
          layout: number,
          strings?: readonly unknown[],
        ): boolean;
        readonly eventNumbers: Float64Array;
        readonly eventLayoutHash: number;
        frame(now: number): void;
        platform(member: number, value: unknown): void;
        stats(): { functions: number; motions: number; handlers: number; bindings: number };
        readonly work: { readonly jsonParses: number };
      }
    | undefined;
}

if (globalThis.__kuitoUI) throw new Error('Kuito UI kernel already installed');

installConsole();

globalThis.__kuitoUI = Object.freeze({
  /** `location`, `file:line:column` in the app, names the function in dev reports. */
  define(id: string, factory: Factory, location?: string) {
    functions[id] = factory;
    defined.add(id);

    if (__KUITO_DEV__ && location !== undefined) locations[id] = location;
  },
  /**
   * The JS thread's operations, as plain data C++ read from the host batch
   * (docs/native-scheduling.md): applied in order, then flushed once.
   */
  receive: measured((operations: unknown) => {
    if (!Array.isArray(operations)) throw new TypeError('UI operations must be an array');

    operations.forEach(applyOperation);
    flush();
  }),
  /** A native event with its JSON payload: a module view's. */
  event: measured(jsonEvent),
  /**
   * A native event in its typed record: its numbers in `eventNumbers`, its
   * strings passed (docs/events.md#typed-events). False sends it on to the
   * JS thread, unread.
   */
  eventRecord: measured(recordEvent),
  eventNumbers,
  /** The layouts' fingerprint: a shell refuses a kernel whose layouts differ from its own. */
  eventLayoutHash: EVENT_LAYOUT_HASH,
  /** A display frame, `now` in milliseconds. */
  frame: measured(frame),
  /** A module's motion value the platform set, on this thread (`motion<T>()` in its spec). */
  platform: measured((member: number, value: unknown) => {
    const id = 'l' + member;
    const record = motions[id];

    if (record) writeMotion(record, value);
    else createMotion(id, value, 0);

    flush();
  }),
  /** What the UI kernel holds now, by store: each stays flat while the app does. */
  stats: () => ({
    functions: Object.keys(functions).length,
    motions: Object.keys(motions).length,
    handlers: Object.keys(handlers).length,
    bindings: Object.keys(bindings).length,
  }),
  /** The work counters, live (docs/performance.md). */
  work,
});
