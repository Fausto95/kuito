// Linked module members and the native calls waiting on the host.
import { dict } from '../values';

/** An asynchronous native call waiting for the host to settle it. */
export interface PendingModuleCall {
  subject: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export const moduleCalls = dict<PendingModuleCall>();

/** Linked module members by id (src/runtime/link.ts): names for errors, and who hears what the platform sends. */
export const linked = {
  names: dict<string>(),
  receivers: dict<(value: unknown) => void>(),
  /**
   * Main-thread functions that answer at once, by function: UI-thread code
   * calls them on its own thread, with no hop (src/ui-thread/wire.ts).
   */
  direct: new WeakMap<object, number>(),
  /**
   * Views by kind (`module:<Name>`): the id that registers the kind natively,
   * its events and methods, and whether it takes children.
   */
  views: dict<{
    id: number;
    registered: boolean;
    events: string[];
    methods: Record<string, (...args: unknown[]) => unknown>;
    children: boolean;
  }>(),
};

export const counters = { moduleCall: 0 };
