// Types for the globals the runtime kernel (src/runtime) installs into a node:vm context.
// The kernel is plain JS evaluated in its own realm, so tests see it through
// these interfaces and narrow the sandbox with `assertKernel`.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { KERNEL_OUTPUT } from '../../src/dev/kernel.ts';

export type Props = Record<string, unknown>;

/**
 * Resolves once the kernel has flushed what signal writes outside a native
 * event scheduled: they reach listeners and the host on the next microtask.
 */
export const flushed = () => Promise.resolve();

export type Component = (props: Props) => unknown;

export interface VNode {
  readonly type: string | Component;
  readonly props: Props;
}

export type KuitoJSX = (
  type: string | Component,
  props?: Props | null,
  ...children: unknown[]
) => VNode;

export interface Signal<T = unknown> {
  value: T;
  readonly listenerCount: number;
  subscribe(listener: (value: T) => void): () => void;
}

/** A value derived from signals: read like one, never written. */
export interface Computed<T = unknown> {
  readonly value: T;
  readonly listenerCount: number;
  subscribe(listener: (value: T) => void): () => void;
}

export interface KuitoEvent {
  readonly type: string;
  readonly target: KuitoElement | null;
  readonly currentTarget: KuitoElement | null;
  readonly defaultPrevented: boolean;
  readonly [payload: string]: unknown;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

export interface EventInit {
  type: string;
  bubbles?: boolean;
  cancelable?: boolean;
}

export interface KuitoElement {
  readonly id: string;
  readonly parent: KuitoElement | null;
  readonly children: KuitoElement[];
  setProperty(key: string, value: unknown): void;
  focus(): void;
  blur(): void;
  addEventListener(
    type: string,
    listener: (event: KuitoEvent) => unknown,
    options?: boolean | { capture?: boolean; once?: boolean },
  ): void;
  removeEventListener(type: string, listener: (event: KuitoEvent) => unknown): void;
  dispatchEvent(event: EventInit): boolean;
}

export interface Ref<T = KuitoElement> {
  current: T | null;
}

export interface PatchApi {
  state<T>(key: string, initial: T): Signal<T>;
  render(tree: unknown): void;
}

export interface TaskContext {
  readonly signal: AbortSignal;
}

export interface AsyncTask<T> {
  readonly running: Signal<boolean>;
  readonly pending: Signal<boolean>;
  readonly data: Signal<T | undefined>;
  readonly error: Signal<Error | null>;
  run(...args: unknown[]): Promise<T>;
  refresh(...args: unknown[]): Promise<T>;
  cancel(reason?: unknown): void;
}

export interface AnimationSpec {
  readonly type: string;
  readonly delay: number;
  readonly [option: string]: unknown;
}

export interface AnimatedValue {
  readonly target?: unknown;
  readonly __kuitoAnimation: AnimationSpec;
}

export type LifecycleKind = 'mount' | 'cleanup' | 'effect' | 'watch';

export interface Subscription {
  remove(): void;
}

export interface KeyboardKernel {
  dismiss(): void;
  addListener(name: string, listener: (event: Props) => unknown): Subscription;
  frame(): Props | null;
  /** keyboard.height, the motion value the keyboard moves every frame. */
  heightMotion(): { value: unknown };
}

export interface AccessibilityKernel {
  announce(message: string, options?: { queue?: boolean }): void;
  focus(target: { readonly id: string }): void;
  status(): { screenReaderEnabled: boolean; reduceMotionEnabled: boolean } | null;
  addEventListener(name: string, listener: (enabled: boolean) => unknown): Subscription;
}

/** Work the kernel did, counted by `__kuito.stats()`. */
export interface KernelWork {
  readonly thunkEvaluations: number;
  readonly subscriptionsCreated: number;
  readonly subscriptionsDestroyed: number;
  readonly sendPropCalls: number;
  readonly bytesStringified: number;
  /** `__kuito.ui` messages from the UI thread: calls, signal writes, moved values. */
  readonly uiMessages: number;
  /** JSON the kernel parsed from the host: a module view's event payloads. */
  readonly jsonParses: number;
}

/** What the kernel holds now, by store: each stays flat while the app does. */
export interface KernelHeld {
  readonly states: number;
  readonly motions: number;
  readonly remotes: number;
  readonly signals: number;
  readonly gestureTags: number;
  readonly views: number;
  readonly handlers: number;
}

export interface KernelStats {
  readonly replans: number;
  readonly total: KernelWork;
  readonly lastReplan: KernelWork;
  readonly held: KernelHeld;
}

export interface KuitoKernel {
  installStyles(styles: Props, rootFontSize?: number, conditions?: unknown): void;
  /** The window's width class, as `window.widthClass` reads it. */
  widthClass(): { readonly value: string };
  defineComponent(id: string, fn: Component, hash: string, cacheable?: boolean): Component;
  patch(moduleId: string, register: (api: PatchApi) => void): void;
  /** `name` names the hook's slot, as the compiler passes it; see docs/reactivity.md. */
  useTask<T>(
    work: (context: TaskContext, ...args: unknown[]) => T | Promise<T>,
    options?: { policy?: string },
    name?: string,
  ): AsyncTask<T>;
  useResource<T>(work: (context: TaskContext) => T | Promise<T>, name?: string): AsyncTask<T>;
  useLifecycle(
    kind: LifecycleKind,
    fn: () => unknown,
    callback?: (value: unknown, previous: unknown) => unknown,
    options?: { immediate?: boolean },
    name?: string,
  ): void;
  useRef<T = KuitoElement>(name?: string): Ref<T>;
  useState<T>(initial: T, name?: string): Signal<T>;
  useMotion<T>(initial: T, name?: string): { value: T };
  /** The motion values views of `kind` move every frame, by field (docs/motion.md#motion-sources). */
  useMotionSource(kind: string, name?: string): Record<string, { value: unknown }>;
  /** Internal until Phase 7 exports it from kuito. */
  computed<T>(fn: () => T): Computed<T>;
  /** A native event: the view's number (0 for the app), the event, its JSON payload. */
  dispatch(handle: number, type: string, payload?: string | Record<string, unknown>): unknown;
  /** A native event in its typed record: numbers in `eventNumbers`, strings passed. */
  dispatchRecord(handle: number, type: string, layout: number, strings?: string[]): unknown;
  readonly eventNumbers: Float64Array;
  readonly eventLayoutHash: number;
  state(moduleId: string, key: string): Signal | undefined;
  revision(moduleId: string): number;
  view(id: string): { id: string; handle: number; kind: string; parent: string } | null;
  dispose(moduleId: string): boolean;
  /** A snapshot of the kernel's counters. */
  stats(): KernelStats;
  /** The work counters themselves, live: what a shell reads after each job. */
  readonly work: KernelWork;
  /** A module function bound to its id, thread and argument schema: what a spec's stub calls. */
  link(id: number, name: string, thread: string, schema: unknown[]): unknown;
  /** A module event bound to its id: `addListener` observes the platform while it has listeners. */
  linkEvent(id: number, name: string): unknown;
  /** A module's live value bound to its id: a read-only signal of platform state. */
  linkLive(id: number, name: string): unknown;
  /** A module's view bound to its id: the kind JSX renders, and the methods its element answers. */
  linkView(
    id: number,
    name: string,
    events: string[],
    methods: Record<string, unknown>,
    children?: unknown,
  ): string;
  /** The platform signals styles that branch read: what src/native/media.ts provides. */
  provideMedia(sources: { colorScheme?: unknown; windowMetrics?: unknown }): void;
  readonly keyboard: KeyboardKernel;
  readonly accessibility: AccessibilityKernel;
  /** A compiled chunk of the app, evaluated on its first `requireChunk` (docs/navigation.md#route-modules). */
  defineChunk(name: string, factory: ChunkFactory): void;
  /** A chunk's exports, evaluating it, or loading it from the host, the first time. */
  requireChunk(name: string): Record<string, unknown>;
  /** A new revision of the app: its chunks replace the last one's, none evaluated yet. */
  resetChunks(): void;
}

export type ChunkFactory = (
  require: (name: string) => unknown,
  module: { exports: Record<string, unknown> },
  exports: Record<string, unknown>,
) => void;

export interface KuitoGlobals {
  __kuito: KuitoKernel;
  __kuitoJSX: KuitoJSX;
  __kuitoFragment: string;
  __kuitoExpr<T>(key: string, evaluate: () => T): () => T;
}

/** The view a fake host records for each created view (test/support/host-wire.ts). */
export interface HostView {
  kind: string;
  parent: string;
  props: Props;
}

/** Built once per run by test/support/global-setup.ts. */
export const bootstrapSource = readFileSync(KERNEL_OUTPUT, 'utf8');

export function assertKernel<H extends object>(host: H): asserts host is H & KuitoGlobals {
  if (!('__kuito' in host) || !('__kuitoJSX' in host))
    throw new Error('The Kuito kernel is not installed in this context');
}

/** Evaluates the kernel with `host` as the vm global and returns it typed. */
export function installKernel<H extends object>(host: H): H & KuitoGlobals {
  runInNewContext(bootstrapSource, host);
  assertKernel(host);

  return host;
}
