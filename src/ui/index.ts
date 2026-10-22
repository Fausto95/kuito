/** Kuito's public TSX API: no manual patch(), render(), or IDs. */
export {
  VStack,
  Pressable,
  SafeArea,
  Sheet,
  HStack,
  Box,
  Scroll,
  Text,
  Button,
  TextField,
  Image,
  Symbol,
  Spacer,
  Divider,
  Toggle,
  Spinner,
  Fragment,
} from './primitives';

export { List } from './flat-list';
export { Page, Pager } from './pager';
export type { PageProps, PagerProps } from './pager';

export type {
  ListHandle,
  ListProps,
  ListItem,
  ScrollToIndexOptions,
  Viewability,
  ViewableItem,
} from './flat-list';

export * from './animations';
export { clamp, interpolate, motion, scrollMotion, sheetMotion } from './motion';
export * from './gestures';

export { Link, Route, Router, Tab, Tabs, goBack, navigate, present, routes } from './navigation';

export type {
  Destination,
  HeaderItem,
  HeaderSearch,
  LinkProps,
  ParamType,
  ParamValue,
  Presentation,
  RouteOptions,
  RouteParams,
  RouteProps,
  RouterProps,
  Routes,
  RouteTo,
  ScreenHeader,
  ScreenProps,
  TabIcon,
  TabProps,
} from './navigation';

export type {
  Derived,
  Extrapolate,
  InterpolateOptions,
  Motion,
  ScrollMotion,
  SheetMotion,
} from './motion';

export {
  computed,
  effect,
  inherit,
  inherited,
  onCleanup,
  onMount,
  provide,
  resource,
  signal,
  task,
  watch,
} from './reactivity';

export { store } from './store';

export type {
  Inherited,
  ReadonlySignal,
  Resource,
  Signal,
  Task,
  TaskContext,
  TaskOptions,
  TaskWork,
} from './reactivity';

export type * from './events';
export type * from './refs';
export type { Component, Primitive, TextContent, KuitoElement, KuitoNode } from './jsx';
export type * from './primitives';

// Control flow and the platform's capabilities come from the root too: one
// entry for every app import (docs/apps.md).
export { Catch, For, Loading, Match, Show, Switch } from './flow';

export type {
  BranchChildren,
  CatchProps,
  ForProps,
  LoadingProps,
  MatchProps,
  ShowProps,
  SwitchProps,
  Truthy,
} from './flow';

export * from '../native';
import type { AccessibilityRuntime } from './accessibility';
import type { KeyboardRuntime } from './keyboard';
import type { Motion, ScrollMotion, SheetMotion } from './motion';
import type { ElementRef, ElementHandle } from './refs';
import type { StyleDeclarations } from './primitives';
import type {
  Inherited,
  ReadonlySignal,
  Resource,
  Signal,
  Task,
  TaskOptions,
  TaskWork,
} from './reactivity';

declare global {
  // Present only inside the Kuito runtime. A clear error elsewhere is useful.
  var __kuito:
    | {
        useState<T>(initial: T, name?: string): Signal<T>;
        useMotion<T>(initial: T, name?: string): Motion<T>;
        useMotionSource(kind: 'Scroll', name?: string): ScrollMotion;
        useMotionSource(kind: 'Sheet', name?: string): SheetMotion;
        useMotionSource(
          kind: 'NavigationStack',
          name?: string,
        ): { readonly progress: Motion<number> };
        useRef<T>(name?: string): { current: T | null };
        computed<T>(fn: () => T): ReadonlySignal<T>;
        inherited<T>(fallback: T, name?: string): Inherited<T>;
        provide<T>(key: Inherited<T>, value: T | ReadonlySignal<T>): void;
        inherit<T>(key: Inherited<T>): ReadonlySignal<T>;
        /** Runs `fn` without subscribing to what it reads. */
        untracked<T>(fn: () => T): T;
        /** The app's one Router, held across Live Patches (docs/navigation.md). */
        navigation: { router: unknown };
        /** Follows what `select` reads from now on; returns how to stop. */
        watch<T>(
          select: () => T,
          fn: (next: T, previous: T | undefined) => void | (() => void),
          options?: { immediate?: boolean },
        ): () => void;
        useLifecycle(
          kind: string,
          fn: Function,
          callback?: Function,
          options?: object,
          name?: string,
        ): void;
        useTask<A extends unknown[], T>(
          work: TaskWork<A, T>,
          options?: TaskOptions,
          name?: string,
        ): Task<A, T>;
        useResource<T>(work: TaskWork<[], T>, name?: string): Resource<T>;
        /** fetch's host and transfers, streaming to or from a file (src/native/file-system.ts). */
        fileTransfer(request: {
          url: string;
          method: 'GET' | 'POST' | 'PUT' | 'PATCH';
          headers: Record<string, string>;
          saveTo?: string;
          body?:
            | string
            | ArrayBuffer
            | { file: string; prefix?: ArrayBuffer; suffix?: ArrayBuffer };
          progress?: 'send' | 'receive';
          onProgress?: (bytes: number, total: number | null) => void;
        }): {
          result: Promise<{ status: number; url: string; headers: Headers; body: ArrayBuffer }>;
          cancel(): void;
        };
        createSignal<T>(initial: T): Signal<T>;
        createSource<T>(read: () => T, observe: (set: (value: T) => void) => () => void): Signal<T>;
        createMotion<T>(initial: T): Motion<T>;
        freeMotion(value: Motion<unknown>): void;
        reportError(message: string, error: unknown): void;
        reportWarning(message: string): void;
        setup(): boolean;
        own<T>(label: string, create: () => T, start: (value: T) => () => void, name?: string): T;
        /** Defines the task the OS runs under `name` (docs/background-tasks.md). */
        defineBackgroundTask(
          name: string,
          task: Function,
          module: {
            finish(id: string, succeeded: boolean): Promise<void>;
            run: { addListener(listener: (payload: unknown) => void): unknown };
          },
        ): void;
        keyboard: KeyboardRuntime;
        accessibility: AccessibilityRuntime;
        /** The window's width class, which `@media (width-class: …)` follows too. */
        widthClass(): ReadonlySignal<'compact' | 'medium' | 'expanded'>;
        /** The platform signals styles that branch read (src/native/media.ts). */
        provideMedia(sources: {
          colorScheme?: ReadonlySignal<string | null>;
          windowMetrics?: ReadonlySignal<{ width: number }>;
        }): void;
        /** Renders a list row into a native cell (docs/lists.md); List's engine. */
        renderCell(list: string, cell: string, key: string, render: (() => unknown) | null): void;
        boundCells(list: string): { cell: string; key: string }[];
      }
    | undefined;
}

export class KuitoCustomEvent<T> {
  readonly type: string;
  readonly detail: T;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  constructor(type: string, init: { detail: T; bubbles?: boolean; cancelable?: boolean }) {
    this.type = type;
    this.detail = init.detail;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
  }
}

export function ref<T extends ElementHandle = ElementHandle>(name?: string): ElementRef<T> {
  if (!globalThis.__kuito) throw Error('ref() requires Kuito');
  return globalThis.__kuito.useRef<T>(name);
}

/** The platform an app's bundle is for. */
export type Platform = 'ios' | 'android';

// Replaced by the compiler with the bundle's platform.
declare const __KUITO_PLATFORM__: Platform;

/**
 * `'ios'` or `'android'`, fixed when the app is compiled: each platform gets
 * its own bundle, and a branch on `platform` for the other one is dropped
 * from it (docs/styles.md#platforms).
 */
export const platform: Platform = __KUITO_PLATFORM__;

/**
 * A style in `styles()`: declarations, `@platform` and `@media` blocks of
 * them, and `variants: { <name>: { <value>: { … } } }`.
 */
type StyleRule = { [property: string]: StyleDeclarations[string] | StyleRule };

/**
 * Compiler-only StyleX-inspired declarations: each named style becomes a
 * class name, its variants picked by data attributes in the class list,
 * `class={[sheet.card, { size: 'large' }]}` (docs/styles.md#variants).
 */
export function styles<T extends Record<string, StyleRule>>(_rules: T): { [K in keyof T]: string } {
  throw Error('styles() must be compiled by Kuito. Check your compiler setup.');
}
