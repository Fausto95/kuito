// `__kuito`: what compiled apps, the dev host and native shells call.
import { accessibility } from './accessibility';
import { asyncStateKeys, type TaskOptions } from './async-task';
import { defineBackgroundTask, isHeadless } from './background-tasks';
import { kernelStats } from './devtools';
import { reportError, reportWarning } from './errors';
import { dispatch, dispatchRecord } from './events';
import { inheritedKey, inheritedSignal, inheritedValue, inherited } from './inherited';
import { EVENT_LAYOUT_HASH } from './protocol.generated';
import { keyboard } from './keyboard';
import { boundCells, renderCell } from './lists';
import { makeLifecycle, safeDispose, type WatchOptions } from './lifecycle';
import { link, linkEvent, linkLive, linkMotion, linkView } from './link';
import { fileTransfer } from './fetch';
import { defineChunk, requireChunk, resetChunks } from './chunks';
import { loadShippedUIBundle, loadUIBundle } from './operations';
import { dispose, patch } from './patch';
import { navigation } from './state/app';
import { eventNumbers } from './state/batch';
import { componentDefinitions, type HookRef, type RenderingContext } from './state/components';
import { modules, stateStore } from './state/modules';
import type { MotionHandle } from './state/motion';
import { signalNames, tracking } from './state/signals';
import { stats } from './state/stats';
import { nativeStyles, settings, styleConditions } from './state/styles';
import { views } from './state/views';
import { computed, createSignal, createSource, untracked } from './signals';
import { computeOf } from './derived';
import { createMotionSource } from './motion-sources';
import { createMotion, freeMotion } from './motion-values';
import { findView, labelOf } from './view-ids';
import { dict, isFunction, isPlainData, own } from './values';
import { provideMedia, widthClass } from './style-conditions';

/** Hooks claim a slot in the component being rendered. */
function rendering(hook: string): RenderingContext {
  if (!tracking.rendering) throw new Error(hook + '() must run during component initialization');

  return tracking.rendering;
}

/**
 * The hook's slot, `<path>:<kind>:<name>`: its identity across patches
 * (docs/reactivity.md). `name` is what the compiler passed; an uncompiled call
 * is named by its ordinal among the unnamed hooks of its kind, and a name
 * claimed twice in one render takes `name#2`. `states` are the state keys the
 * hook holds, from its key.
 */
function claimSlot(
  context: RenderingContext,
  kind: string,
  name: unknown,
  states: (key: string) => string[] = (key) => [key],
): HookRef {
  const { ordinals, names, instances, path } = context;
  let base: string;

  if (typeof name === 'string' && name) base = name;
  else {
    ordinals[kind] = (own(ordinals, kind) ? ordinals[kind] : 0) + 1;
    base = '#' + ordinals[kind];
  }

  const seen = (own(names, kind + ':' + base) ? names[kind + ':' + base] : 0) + 1;
  const slotName = seen === 1 ? base : base + '#' + seen;
  const key = path + ':' + kind + ':' + slotName;
  const slot = { owner: path, kind, name: slotName, states: states(key) };

  names[kind + ':' + base] = seen;
  instances.hooks[key] = slot;

  return { key, owner: path };
}

/** The style compiler's conditions: each class's `@media` alternates, each token's themes. */
function installConditions(conditions: unknown): void {
  if (
    !isPlainData(conditions) ||
    !isPlainData(conditions.when) ||
    !isPlainData(conditions.themes) ||
    !isPlainData(conditions.variants)
  )
    throw TypeError('Invalid native style conditions');

  const { when, themes, variants } = conditions;

  Object.keys(variants).forEach((name) => {
    const invalid = () => TypeError('Invalid variants for native class ' + name);
    const names = variants[name];
    const copy = dict<Record<string, string>>();

    if (!isPlainData(names)) throw invalid();

    Object.keys(names).forEach((variant) => {
      const values = names[variant];
      const classes = dict<string>();

      if (!isPlainData(values)) throw invalid();

      Object.keys(values).forEach((value) => {
        const generated = values[value];

        if (typeof generated !== 'string') throw invalid();

        classes[value] = generated;
      });

      copy[variant] = classes;
    });

    styleConditions.variants[name] = copy;
  });

  Object.keys(when).forEach((name) => {
    const alternates = when[name];

    if (
      !Array.isArray(alternates) ||
      !alternates.every(
        (item) => isPlainData(item) && isPlainData(item.media) && isPlainData(item.props),
      )
    )
      throw TypeError('Invalid @media alternates for native class ' + name);

    styleConditions.when[name] = alternates;
  });

  (['light', 'dark'] as const).forEach((scheme) => {
    const theme = themes[scheme];

    if (!isPlainData(theme)) throw TypeError('Invalid ' + scheme + ' theme in native styles');

    Object.assign(styleConditions.themes[scheme], theme);
  });
}

function installStyles(styles: unknown, rootFontSize?: unknown, conditions?: unknown): void {
  if (rootFontSize !== undefined) {
    if (typeof rootFontSize !== 'number' || !Number.isFinite(rootFontSize) || rootFontSize <= 0)
      throw TypeError('Invalid rootFontSize in Kuito stylesheet');

    settings.rootFontSize = rootFontSize;
  }

  if (!styles || typeof styles !== 'object') throw TypeError('Invalid native style manifest');

  Object.assign(nativeStyles, styles);

  if (conditions !== undefined) installConditions(conditions);
}

/**
 * Registers a compiled component and returns it: the compiler wraps each
 * component's function in this call, so only one the bundle keeps is registered.
 */
function defineComponent<F>(id: unknown, fn: F, hash: unknown, cacheable: unknown): F {
  if (!isFunction(fn) || !id || typeof id !== 'string')
    throw TypeError('Invalid compiled component');

  Object.defineProperty(fn, '__kuitoDefinitionId', { value: id, configurable: true });
  componentDefinitions[id] = { fn, hash, cacheable: !!cacheable };

  return fn;
}

export function createApi() {
  return Object.freeze({
    installStyles,
    defineComponent,
    // A background launch evaluates the app for its task definitions only.
    patch: (...args: Parameters<typeof patch>) => (isHeadless() ? 0 : patch(...args)),
    useTask(work: unknown, options?: TaskOptions, name?: unknown) {
      const context = rendering('task');

      return context.api.asyncTask(
        claimSlot(context, 'async', name, asyncStateKeys),
        work,
        options,
        false,
      );
    },
    useResource(work: unknown, name?: unknown) {
      const context = rendering('resource');

      return context.api.asyncTask(
        claimSlot(context, 'async', name, asyncStateKeys),
        work,
        { policy: 'replace' },
        true,
      );
    },
    useLifecycle(
      kind: string,
      fn: unknown,
      callback?: unknown,
      options?: WatchOptions,
      name?: unknown,
    ) {
      const context = rendering(kind);

      context.api.lifecycle(
        kind,
        fn,
        callback,
        options,
        claimSlot(context, kind, name, () => []),
      );
    },
    useRef(name?: unknown) {
      const context = rendering('ref');

      return context.api.state<{ current: unknown }>(claimSlot(context, 'ref', name).key, {
        current: null,
      }).value;
    },
    /** The Components panel shows a signal by the variable it is declared as. */
    useState<T>(initial: T, name?: unknown) {
      const context = rendering('state');
      const signal = context.api.state(claimSlot(context, 'state', name).key, initial);

      if (typeof name === 'string' && name[0] !== '#') signalNames.set(signal, name);

      return signal;
    },
    /** A value that moves every frame; reads and writes never wait for the UI thread. */
    useMotion(initial: unknown, name?: unknown) {
      const context = rendering('motion');
      const slot = context.api.state<MotionHandle | null>(
        claimSlot(context, 'motion', name).key,
        null,
      );

      if (!slot.value) slot.value = createMotion(initial);

      return slot.value;
    },
    /** The motion values views of `kind` move every frame, by field (docs/motion.md#motion-sources). */
    useMotionSource(kind: unknown, name?: unknown) {
      if (typeof kind !== 'string') throw new TypeError('A motion source names its kind');

      const context = rendering('motion source');
      const slot = context.api.state<Readonly<Record<string, MotionHandle>> | null>(
        claimSlot(context, 'motionSource', name).key,
        null,
      );

      if (!slot.value) slot.value = createMotionSource(kind);

      return slot.value;
    },
    computed,
    /** A computed the compiler placed on the UI thread: a derived value of the motion values it reads. */
    derive: computeOf,
    untracked,
    inherited,
    /** Provides `value` (or the signal it is) to the descendants of the component setting up. */
    provide(key: unknown, value: unknown) {
      rendering('provide').provisions.push({ key: inheritedKey('provide', key), value });
    },
    /** What the component setting up inherits for `key`, as a signal. */
    inherit(key: unknown) {
      const context = rendering('inherit');
      const read = inheritedKey('inherit', key);
      const value = inheritedValue(context.inherited, read);

      context.inherits.push({ key: read, value });

      return inheritedSignal(value);
    },
    /** A watch outside any component: it follows `select` from now until the returned stop. */
    watch(select: unknown, callback: unknown, options?: WatchOptions) {
      if (!isFunction(select) || !isFunction(callback))
        throw new TypeError('watch() requires a source and a function');

      const record = makeLifecycle('watch', select, callback, options);

      record.mount();

      return () => safeDispose(record);
    },
    // Module state outside any component: a scope effect's own signals and
    // motion values, and the system state a module keeps current.
    createSignal,
    createSource,
    /** The error seam for failures nobody awaits: a rejected write, a failed release. */
    reportError,
    /** The warning seam: data a module could not use, such as a stored value its schema rejects. */
    reportWarning,
    createMotion,
    freeMotion,
    /** Whether a component is setting up, so a scope effect called now belongs to it. */
    setup: () => tracking.rendering !== null,
    /**
     * A resource the component setting up owns (docs/native-modules.md):
     * made once per slot, started when the component mounts, and released
     * by what `start` returns when the component or the call goes.
     */
    own<T>(label: string, create: () => T, start: (value: T) => () => void, name?: unknown): T {
      const context = tracking.rendering;

      if (!context)
        throw new Error(
          label +
            '() must run while a component sets up, which owns it; pass { scope: app } for one the app holds',
        );

      const hook = claimSlot(context, 'own', name);
      const slot = context.api.state<{ held: T } | null>(hook.key, null);
      const held = slot.value ? slot.value.held : create();

      if (!slot.value) slot.value = { held };

      context.api.lifecycle('mount', () => start(held), undefined, undefined, hook);

      return held;
    },
    loadUI: loadUIBundle,
    loadShippedUI: loadShippedUIBundle,
    /** The window's width class, which `@media (width-class: …)` follows. */
    widthClass,
    provideMedia,
    navigation,
    defineChunk,
    requireChunk,
    resetChunks,
    dispatch,
    dispatchRecord,
    /** Where native writes a typed event's numbers before `dispatchRecord`. */
    eventNumbers,
    /** The layouts' fingerprint: a shell refuses a kernel whose layouts differ from its own. */
    eventLayoutHash: EVENT_LAYOUT_HASH,
    renderCell,
    boundCells,
    state: (moduleId: string, key: string) => stateStore[moduleId + ':' + key],
    revision: (moduleId: string) => (own(modules, moduleId) ? modules[moduleId].revision : 0),
    /** The committed view `label` names: its kind and its parent's label. */
    view(label: string) {
      const id = findView(label);
      const view = id === null ? undefined : views.get(id);

      // `handle` is the number the host batch and native events name it by.
      return view && id !== null
        ? {
            id: label,
            handle: id,
            kind: view.kind,
            parent: view.parent === null ? null : labelOf(view.parent),
          }
        : null;
    },
    dispose,
    stats: kernelStats,
    /** The work counters, live: a shell reads them after each job (docs/performance.md). */
    work: stats.total,
    fileTransfer,
    link,
    linkEvent,
    linkLive,
    linkMotion,
    linkView,
    defineBackgroundTask,
    keyboard,
    accessibility,
  });
}
