// The Components panel's messages (docs/devtools.md), one JSON object
// `{ event, payload }` each way. The kernel (src/runtime/devtools.ts) answers;
// the panel (src/dev/components-panel) asks. Types only: both sides import it.

/**
 * A value as the panel shows it: plain data, with what JSON cannot carry
 * described (`ƒ name()`, `undefined`) and what lies too deep elided (`…`).
 */
export type Shown = null | boolean | number | string | Shown[] | { [key: string]: Shown };

/** A mounted component instance; `parent` is the enclosing instance's id, null at a root. */
export interface TreeNode {
  id: number;
  name: string;
  key: string | null;
  parent: number | null;
}

export interface ComponentRef {
  id: number;
  name: string;
  key: string | null;
}

/** A signal: a component's state, a computed, or one the app made outside a component. */
export interface SignalRef {
  /** Stable while the signal lives in this runtime. */
  signal: number;
  name: string;
  kind: 'state' | 'computed' | 'signal';
  value: Shown;
  /** The component whose hook holds it. */
  owner: ComponentRef | null;
}

export type HookDetails =
  | { kind: 'state'; name: string; signal: number; value: Shown }
  | { kind: 'task'; name: string; running: boolean; data: Shown; error: Shown }
  | { kind: 'motion'; name: string; motion: string; value: Shown }
  | { kind: 'ref'; name: string; value: Shown };

export interface ComponentDetails extends ComponentRef {
  /** As the component reads them: expressions evaluated, without `key` and `children`. */
  props: Record<string, Shown>;
  hooks: HookDetails[];
  /** Enclosing instances, nearest first. */
  owners: ComponentRef[];
  /** The native views it rendered that none of its other views contains. */
  views: ViewRef[];
}

export interface ViewRef {
  view: number;
  kind: string;
  label: string;
}

export interface PropDetails {
  name: string;
  value: Shown;
  /** The binding that keeps it current, with the signals its last run read; null for a constant. */
  binding: { signals: SignalRef[] } | null;
  /** The signal write behind its last update while a panel was connected (`visits = 2`), if any. */
  cause: string | null;
}

export interface ViewDetails extends ViewRef {
  parent: ViewRef | null;
  children: ViewRef[];
  component: ComponentRef | null;
  props: PropDetails[];
}

/** A prop a signal's binding writes. */
export interface Drive extends ViewRef {
  prop: string;
}

/** A branch a signal decides: a Show, a flow Switch, a reactive child expression, or a whole module. */
export interface Branch {
  module: string;
  component: ComponentRef | null;
}

export interface SignalDetails extends SignalRef {
  drives: Drive[];
  decides: Branch[];
}

/** A state signal's write, as the kernel keeps it (oldest first). */
export interface HistoryEntry {
  /** Counts every write since the runtime started; stable while the write is kept. */
  index: number;
  name: string;
  owner: ComponentRef | null;
  value: Shown;
}

export type PanelMessage =
  | { event: 'connect' }
  | { event: 'shutdown' }
  | { event: 'inspectComponent'; payload: { id: number } }
  | { event: 'inspectView'; payload: { view: number } }
  | { event: 'inspectSignal'; payload: { signal: number } }
  | { event: 'highlightComponent'; payload: { id: number } }
  | { event: 'highlightView'; payload: { view: number } }
  | { event: 'clearHighlight' }
  | { event: 'startInspecting' }
  | { event: 'stopInspecting' }
  | { event: 'setSignal'; payload: { signal: number; value: unknown } }
  | { event: 'setProp'; payload: { view: number; prop: string; value: unknown } }
  | { event: 'setMotion'; payload: { motion: string; value: unknown } }
  | { event: 'history' };

export type KernelMessage =
  /** A new runtime: whatever the panel showed belongs to the last one. */
  | { event: 'hello' }
  | { event: 'tree'; payload: { components: TreeNode[] } }
  | { event: 'component'; payload: ComponentDetails | null }
  | { event: 'view'; payload: ViewDetails | null }
  | { event: 'signal'; payload: SignalDetails | null }
  /** A tap on the device while inspecting picked `view`, rendered by `component`. */
  | { event: 'selected'; payload: { view: number; component: number | null } }
  /** The writes kept, oldest first; `dropped` older ones no longer are. */
  | { event: 'history'; payload: { writes: HistoryEntry[]; dropped: number } }
  /** A message the kernel could not take, and why. */
  | { event: 'refused'; payload: { message: string } };
