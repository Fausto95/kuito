// The Components panel's state: what the kernel last answered and what the
// panel selected, changed only by `reduce`.
import type {
  ComponentDetails,
  HistoryEntry,
  KernelMessage,
  PanelMessage,
  SignalDetails,
  TreeNode,
  ViewDetails,
} from '../../runtime/devtools-protocol';

export interface Selection {
  component: number | null;
  view: number | null;
  signal: number | null;
}

export interface PanelState {
  /** The connection's state, or the last thing the kernel refused; '' when there is nothing to say. */
  status: string;
  tree: TreeNode[];
  selection: Selection;
  component: ComponentDetails | null;
  view: ViewDetails | null;
  signal: SignalDetails | null;
  /** Waiting for a tap on the device. */
  inspecting: boolean;
  /** The kernel's kept signal writes, while the panel shows them. */
  history: { writes: HistoryEntry[]; dropped: number } | null;
  showsHistory: boolean;
}

export type Action =
  | { type: 'reset' }
  | { type: 'status'; text: string }
  | { type: 'received'; message: KernelMessage }
  | { type: 'select'; selection: Partial<Selection> }
  | { type: 'inspecting'; on: boolean }
  | { type: 'history'; on: boolean };

export const initialState: PanelState = {
  status: 'Connecting…',
  tree: [],
  selection: { component: null, view: null, signal: null },
  component: null,
  view: null,
  signal: null,
  inspecting: false,
  history: null,
  showsHistory: false,
};

/** What each kernel message changes. */
const RECEIVED: {
  [E in KernelMessage['event']]: (
    state: PanelState,
    message: Extract<KernelMessage, { event: E }>,
  ) => PanelState;
} = {
  hello: () => initialState,
  tree: (state, { payload }) => {
    const live = payload.components.some((node) => node.id === state.selection.component);

    return {
      ...state,
      // The tree ends "Connecting…"; what the kernel said since stays.
      status: state.status === initialState.status ? '' : state.status,
      tree: payload.components,
      ...(live ? {} : { component: null, selection: { ...state.selection, component: null } }),
    };
  },
  component: (state, { payload }) => ({
    ...state,
    component: payload,
    selection: payload ? state.selection : { ...state.selection, component: null },
  }),
  view: (state, { payload }) => ({
    ...state,
    view: payload,
    selection: payload ? state.selection : { ...state.selection, view: null },
  }),
  signal: (state, { payload }) => ({
    ...state,
    signal: payload,
    selection: payload ? state.selection : { ...state.selection, signal: null },
  }),
  selected: (state, { payload }) => ({
    ...state,
    inspecting: false,
    selection: { component: payload.component, view: payload.view, signal: null },
  }),
  refused: (state, { payload }) => ({ ...state, status: payload.message }),
  history: (state, { payload }) => ({ ...state, history: payload }),
};

export function reduce(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'reset':
      return { ...initialState, showsHistory: state.showsHistory };
    case 'status':
      return { ...state, status: action.text };
    case 'received': {
      const receive: (state: PanelState, message: never) => PanelState =
        RECEIVED[action.message.event];

      return receive(state, action.message as never);
    }
    case 'select': {
      const selection = { ...state.selection, ...action.selection };

      return {
        ...state,
        selection,
        component: selection.component === null ? null : state.component,
        view: selection.view === null ? null : state.view,
        signal: selection.signal === null ? null : state.signal,
      };
    }
    case 'inspecting':
      return { ...state, inspecting: action.on };
    case 'history':
      return { ...state, showsHistory: action.on, history: action.on ? state.history : null };
  }
}

/** The questions that bring the selection's details up to date. */
export function inspections({ selection, showsHistory }: PanelState): PanelMessage[] {
  const asks: PanelMessage[] = showsHistory ? [{ event: 'history' }] : [];

  if (selection.component !== null)
    asks.push({ event: 'inspectComponent', payload: { id: selection.component } });

  if (selection.view !== null)
    asks.push({ event: 'inspectView', payload: { view: selection.view } });

  if (selection.signal !== null)
    asks.push({ event: 'inspectSignal', payload: { signal: selection.signal } });

  return asks;
}
