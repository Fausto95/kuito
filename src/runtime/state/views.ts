// The committed native views, their numbers and what each last sent.
import type { ElementHandle } from '../elements';
import type { Binding, Ref } from '../plan';
import { dict } from '../values';
import type { Environment } from './inherited';

/**
 * A committed native view, kept by its number (src/runtime/view-ids.ts). Its
 * label names it at the host boundary, in event keys and to the app.
 */
export interface KernelView {
  label: string;
  owner: string;
  kind: string;
  parent: number | null;
  /** Its child views, in sibling order. */
  children: number[];
  props: Record<string, unknown>;
  bindings: Record<string, Binding>;
  ref: Ref | null;
  /** Layout-only: the host keeps its layout node but no native view. */
  flattened: boolean;
  /** The path of the component that rendered it, in its module; null at the module's root. */
  component: string | null;
  /** What its place inherits: a list's rows, modules of their own, inherit it. */
  environment: Environment | null;
}

export const views = new Map<number, KernelView>();

/**
 * Views are numbered inside the kernel. A number stands for one label (the
 * app's `id` prop, or `__kuito:<module>:<path>`) from the plan that first
 * names it until its view is removed.
 */
export const viewIds: { next: number; byLabel: Map<string, number>; labels: Map<number, string> } =
  { next: 0, byLabel: new Map(), labels: new Map() };

export const elements = new Map<number, ElementHandle>();

/** The row a native list cell shows: its key, and whether it renders it or nothing. */
export interface CellRecord {
  key: string;
  shown: boolean;
}

/**
 * The module views made on the host. Their own props cross by name
 * (src/runtime/host.ts); `views` learns a view's kind only after its first
 * props are sent.
 */
export const moduleViews = new Map<number, true>();

/**
 * The object props each view last sent, by view and prop: a prop rebuilt to
 * equal data is not sent again, and a key prop diffs against its last keys.
 */
export const sentValues = new Map<number, Record<string, unknown>>();

/** Bound cells of each native list, by list view id and then cell view id. */

export const lists = dict<Record<string, CellRecord>>();
