// A module's registration: what its register function and its components
// produce before the commit point, and how a commit carries their records.
import { createAsyncRecord, type AsyncRecord, type TaskOptions } from './async-task';
import { deliver } from './boundaries';
import type { EventHandler } from './events';
import { makeLifecycle, safeDispose, type LifecycleRecord, type WatchOptions } from './lifecycle';
import { queueOperation } from './operations';
import { createSignal, type AnySignal, type Signal } from './signals';
import type { HookRef, HookSlot, Instances } from './state/components';
import { stateStore, type ModuleRecord } from './state/modules';
import type { Rebind } from './state/threads';
import { dict, isFunction, own, type PlainData } from './values';
import { viewNumber } from './view-ids';

/** What a module's registration function receives. */
export interface PatchApi {
  state<T>(key: string, initial: T): Signal<T>;
  lifecycle(
    kind: string,
    fn: unknown,
    callback: unknown,
    options: WatchOptions | undefined,
    hook: HookRef,
  ): void;
  asyncTask(
    hook: HookRef,
    work: unknown,
    options: TaskOptions | undefined,
    autoStart: boolean,
  ): AsyncRecord;
  render(tree: unknown): void;
}

/** Everything a registration produces before the commit point. */
export interface Registration {
  api: PatchApi;
  states: Record<string, AnySignal>;
  stateKeys: string[];
  handlers: Record<string, EventHandler>;
  uiHandlers: Record<string, PlainData>;
  lifecycle: LifecycleRecord[];
  asyncRecords: AsyncRecord[];
  rendered: { root: { tree: unknown } | null };
  instances: Instances;
  rebinds: Rebind[];
}

export function createRegistration(moduleId: string): Registration {
  const states = dict<AnySignal>();
  const stateKeys: string[] = [];
  const pendingHandlers = dict<EventHandler>();
  const uiHandlers = dict<PlainData>();
  const lifecycle: LifecycleRecord[] = [];
  const asyncRecords: AsyncRecord[] = [];
  const rendered: Registration['rendered'] = { root: null };
  const instances: Instances = { ran: dict<true>(), hooks: dict<HookSlot>() };

  const api: PatchApi = Object.freeze<PatchApi>({
    state<T>(key: string, initial: T): Signal<T> {
      if (!key) throw new Error('Missing state ID');

      const id = moduleId + ':' + key;

      // A retained signal keeps its value, whatever the caller now passes as
      // initial.
      if (own(stateStore, id)) return stateStore[id] as never;

      if (!own(states, id)) {
        states[id] = createSignal(initial);
        stateKeys.push(id);
      }

      return states[id] as never;
    },
    lifecycle(kind, fn, callback, options, hook) {
      if (!isFunction(fn)) throw new TypeError(kind + '() requires a function');

      const record = makeLifecycle(
        kind,
        fn,
        isFunction(callback) ? callback : undefined,
        options,
        (error) => deliver(moduleId, hook.owner, error),
      );

      lifecycle.push({ ...record, hook });
    },
    asyncTask(hook, work, options, autoStart) {
      const record = createAsyncRecord(api, hook, work, options, autoStart, (error) =>
        deliver(moduleId, hook.owner, error),
      );

      asyncRecords.push(record);

      return record;
    },
    render(tree: unknown) {
      if (rendered.root) throw new Error('One UI root per patch');

      rendered.root = { tree };
    },
  });

  return {
    api,
    states,
    stateKeys,
    handlers: pendingHandlers,
    uiHandlers,
    lifecycle,
    asyncRecords,
    rendered,
    instances,
    rebinds: [],
  };
}

/**
 * Reconcile per-component scopes, not entire modules. An instance that kept
 * its cached tree ran none of its hooks, so its records stay; one that ran
 * keeps the mount and cleanup records of hooks it still has (they belong to
 * the instance's lifetime) and replaces the rest; a removed instance, or a
 * removed hook, is disposed. A replacing watch takes over what its
 * predecessor last saw, so a value the re-run changed (a new prop) is a change.
 */
export function carryRecords(
  previous: ModuleRecord,
  registration: Registration,
  activePaths: Record<string, true>,
): { lifecycle: LifecycleRecord[]; asyncRecords: AsyncRecord[] } {
  const lifecycle: LifecycleRecord[] = [];
  const asyncRecords: AsyncRecord[] = [];
  const next = registration.lifecycle;
  const { ran } = registration.instances;
  const retained = ({ owner }: HookRef) => own(activePaths, owner) && !own(ran, owner);

  previous.lifecycleRecords.forEach((record) => {
    const index = next.findIndex((candidate) => candidate.hook.key === record.hook.key);
    const lasting = record.kind === 'mount' || record.kind === 'cleanup';

    if (retained(record.hook)) lifecycle.push(record);
    else if (lasting && index !== -1) {
      next.splice(index, 1);
      lifecycle.push(record);
    } else {
      const successor = next[index]?.seen;

      if (record.kind === 'watch' && record.seen && successor)
        Object.assign(successor, record.seen);

      safeDispose(record);
    }
  });

  previous.asyncRecords.forEach((record) => {
    if (retained(record.hook)) asyncRecords.push(record);
    else safeDispose(record);
  });

  return { lifecycle, asyncRecords };
}

/**
 * The UI thread finds a handler as native events name it: the view's number
 * and the event (`<label>.<event>` here becomes `<number>.<event>`).
 */
export function uiHandlerKey(key: string): string {
  const dot = key.lastIndexOf('.');

  return viewNumber(key.slice(0, dot)) + key.slice(dot);
}

/**
 * UI-thread handlers: the new ones replace the old, whose keys (as
 * `uiHandlerKey` wrote them) are released.
 */
export function commitUIHandlers(previousKeys: string[], next: Record<string, PlainData>): void {
  const keyed = dict<PlainData>();

  Object.keys(next).forEach((key) => {
    keyed[uiHandlerKey(key)] = next[key];
  });

  previousKeys.forEach((key) => {
    if (!own(keyed, key)) queueOperation({ op: 'unhandle', key });
  });

  Object.keys(keyed).forEach((key) => {
    queueOperation(Object.assign({ op: 'handler', key }, keyed[key]));
  });
}
