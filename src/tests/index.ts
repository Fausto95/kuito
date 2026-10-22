// kuito/tests: an app's tests, on the headless host (docs/testing.md). The
// app renders with the kernel it runs on devices, its batches decoded and
// laid out by the shells' own C++, its text measured from a font table.
import type { Mutation } from './batch.ts';
import { costBetween, type Cost } from './cost.ts';
import type { LogEntry, RenderOptions } from './host.ts';
import * as interactions from './interactions.ts';
import type { ModuleCall } from './modules.ts';
import { headlessOf, queriesOf, type Queries, type TestView } from './queries.ts';
import { currentHost } from './session.ts';

export type { Mutation, PropValue, KeyEdit } from './batch.ts';
export type { Cost, CostBudget, CostCounter } from './cost.ts';
export type { FontFace, FontTable } from './fonts.ts';
export type { FetchAnswer, FetchHandler, FetchRequest, LogEntry, RenderOptions } from './host.ts';
export type { PressOptions, ScrollOffset } from './interactions.ts';
export type { Edges } from './layout.ts';
export type { ModuleCall, ModuleFake, ModuleFakes } from './modules.ts';
export type { Queries, RoleOptions, TestView, TextMatch } from './queries.ts';
export type { Rect, Screen } from './renderer.ts';
export { replay, type ReplayOptions, type Replayed } from './replay.ts';

// Node's test runner and strict assertions, which `kuito test` runs the
// tests with: one import for a test file.
export { assert, describe, test } from './node-test.ts';

/** The app a render put on the headless screen. */
export interface RenderedApp extends Queries {
  /** Every view, one line each in id order, as a device describes its tree. */
  tree(): string;
  /** The mutations the kernel's batches carried since this render, in order. */
  readonly mutations: readonly Mutation[];
  /** The native module calls the app made, in order. */
  readonly calls: readonly ModuleCall[];
  /** What the app and the runtime logged. */
  readonly logs: readonly LogEntry[];
  /** Sends a native module's event or live value change, as the platform does. */
  emit(module: string, name: string, value?: unknown): Promise<void>;
}

/**
 * Renders `tree` (`<App />`) as the screen's only root, with the platform
 * `options` describe, and resolves once the app has settled: its requests
 * answered, its timers due now run and its lists' rows bound.
 */
export async function render(tree: unknown, options: RenderOptions = {}): Promise<RenderedApp> {
  const host = currentHost();

  host.render(tree, options);
  await host.settle();

  return {
    ...queriesOf(host.renderer, () => host.renderer.root, host),
    tree: () => host.renderer.describeTree(),
    get mutations() {
      return host.adopt(host.mutations);
    },
    get calls() {
      return host.adopt(host.modules.calls);
    },
    get logs() {
      return host.adopt(host.logs);
    },
    emit: (module, name, value) => {
      host.emit(module, name, value);

      return host.settle();
    },
  };
}

/** Queries over what the last render shows. */
export const screen: Queries = {
  getByText: (text) => queries().getByText(text),
  getAllByText: (text) => queries().getAllByText(text),
  queryByText: (text) => queries().queryByText(text),
  getByRole: (role, options) => queries().getByRole(role, options),
  getAllByRole: (role, options) => queries().getAllByRole(role, options),
  queryByRole: (role, options) => queries().queryByRole(role, options),
};

function queries(): Queries {
  const host = currentHost();

  return queriesOf(host.renderer, () => host.renderer.root, host);
}

/** Queries over the views inside `view`. */
export function within(view: TestView): Queries {
  const host = currentHost();

  return queriesOf(host.renderer, () => headlessOf(view), host);
}

/** Taps `view`, or the Pressable, Button or Toggle it is in. */
export function press(view: TestView, options?: interactions.PressOptions): Promise<void> {
  return interactions.press(currentHost(), headlessOf(view), options);
}

/** Types `text` into the TextField `view` is. */
export function type(view: TestView, text: string): Promise<void> {
  return interactions.type(currentHost(), headlessOf(view), text);
}

/** Scrolls the Scroll or list `view` is in to `offset`, in points. */
export function scroll(view: TestView, offset: interactions.ScrollOffset): Promise<void> {
  return interactions.scroll(currentHost(), headlessOf(view), offset);
}

/** Picks a moment in the DatePicker `view` is, or an option or item by its label in a Select, SegmentedControl or ContextMenu, as a user does. */
export function choose(view: TestView, choice: Date | string): Promise<void> {
  return interactions.choose(currentHost(), headlessOf(view), choice);
}

/** Moves the test's clock on by `ms`: timers fire and animations step, a frame at a time. */
export function advance(ms: number): Promise<void> {
  return currentHost().advance(ms);
}

/**
 * Runs `interaction` once the app has settled, settles what it started, and
 * returns what it cost the main thread in counts (docs/testing.md#cost-budgets):
 * `(await costOf(() => press(like))).toStayWithin({ layoutPasses: 0 })`.
 */
export async function costOf(interaction: () => unknown): Promise<Cost> {
  const host = currentHost();

  await host.settle();

  const before = host.counts();

  await interaction();
  await host.settle();

  return costBetween(before, host.counts());
}
