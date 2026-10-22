// The Components panel's page, drawn from its state: the component tree on
// the left; on the right the selected component, view and signal, each
// linking to the others, signal → binding → view.
import type {
  Branch,
  ComponentDetails,
  ComponentRef,
  Drive,
  HookDetails,
  PanelMessage,
  PropDetails,
  Shown,
  SignalDetails,
  SignalRef,
  TreeNode,
  ViewDetails,
  ViewRef,
} from '../../runtime/devtools-protocol';
import { h } from './dom';
import type { PanelState, Selection } from './store';

export interface Hands {
  select(selection: Partial<Selection>): void;
  send(message: PanelMessage): void;
  inspect(on: boolean): void;
  history(on: boolean): void;
  /** A value typed in the panel, as JSON, could not be read. */
  invalid(text: string): void;
}

const text = (value: Shown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** A value with an editor: Enter sends `edit` the JSON typed, Escape puts it back. */
function editable(value: Shown, edit: (value: unknown) => PanelMessage, hands: Hands) {
  const shown = JSON.stringify(value);
  const input = h('input', {
    class: 'value',
    value: shown,
    title: 'JSON; Enter to set it',
    onkeydown(event) {
      if (event.key === 'Escape') input.value = shown;
      if (event.key !== 'Enter') return;

      let parsed: unknown;

      try {
        parsed = JSON.parse(input.value);
      } catch {
        return hands.invalid(input.value);
      }

      hands.send(edit(parsed));
      input.blur();
    },
  });

  return input;
}

function component(ref: ComponentRef, hands: Hands) {
  return h(
    'button',
    {
      class: 'chip component',
      onclick: () => hands.select({ component: ref.id }),
      onmouseenter: () => hands.send({ event: 'highlightComponent', payload: { id: ref.id } }),
      onmouseleave: () => hands.send({ event: 'clearHighlight' }),
    },
    ref.key === null ? ref.name : `${ref.name} key=${ref.key}`,
  );
}

function view(ref: ViewRef, hands: Hands, suffix = '') {
  return h(
    'button',
    {
      class: 'chip view',
      title: ref.label,
      onclick: () => hands.select({ view: ref.view, signal: null }),
      onmouseenter: () => hands.send({ event: 'highlightView', payload: { view: ref.view } }),
      onmouseleave: () => hands.send({ event: 'clearHighlight' }),
    },
    `${ref.kind} #${ref.view}${suffix}`,
  );
}

function signal(ref: SignalRef, hands: Hands) {
  return h(
    'button',
    {
      class: 'chip signal',
      title: ref.owner ? `${ref.kind} of ${ref.owner.name}` : ref.kind,
      onclick: () => hands.select({ signal: ref.signal }),
    },
    `${ref.name} = ${text(ref.value)}`,
  );
}

function section(title: string, close: () => void, ...rows: (Node | null)[]) {
  return h(
    'section',
    {},
    h('h2', {}, title, h('button', { class: 'close', title: 'Close', onclick: close }, '×')),
    ...rows,
  );
}

function row(name: string, ...cells: (Node | string | null)[]) {
  return h('div', { class: 'row' }, h('span', { class: 'name' }, name), ...cells);
}

function list(name: string, items: Node[]) {
  return items.length ? row(name, h('span', { class: 'chips' }, ...items)) : null;
}

/** What each kind of hook shows. */
const HOOKS: {
  [K in HookDetails['kind']]: (hook: Extract<HookDetails, { kind: K }>, hands: Hands) => Node;
} = {
  state: (hook, hands) =>
    row(
      hook.name,
      editable(
        hook.value,
        (value) => ({ event: 'setSignal', payload: { signal: hook.signal, value } }),
        hands,
      ),
      h(
        'button',
        { class: 'chip signal', onclick: () => hands.select({ signal: hook.signal }) },
        'drives…',
      ),
    ),
  task: (hook) =>
    row(
      hook.name,
      h(
        'span',
        { class: 'task' },
        hook.running ? 'running' : 'idle',
        h('code', {}, 'data ' + text(hook.data)),
        hook.error === null ? null : h('code', { class: 'error' }, 'error ' + text(hook.error)),
      ),
    ),
  motion: (hook, hands) =>
    row(
      hook.name,
      editable(
        hook.value,
        (value) => ({ event: 'setMotion', payload: { motion: hook.motion, value } }),
        hands,
      ),
      h('span', { class: 'kind' }, 'motion'),
    ),
  ref: (hook) =>
    row(hook.name, h('code', {}, text(hook.value)), h('span', { class: 'kind' }, 'ref')),
};

function hookRow(hook: HookDetails, hands: Hands): Node {
  const draw: (hook: never, hands: Hands) => Node = HOOKS[hook.kind];

  return draw(hook as never, hands);
}

function componentSection(details: ComponentDetails, hands: Hands) {
  const props = Object.keys(details.props);

  return section(
    details.key === null ? details.name : `${details.name} key=${details.key}`,
    () => hands.select({ component: null }),
    list(
      'owners',
      details.owners.map((owner) => component(owner, hands)),
    ),
    props.length ? h('h3', {}, 'Props') : null,
    ...props.map((name) => row(name, h('code', {}, text(details.props[name])))),
    details.hooks.length ? h('h3', {}, 'Hooks') : null,
    ...details.hooks.map((hook) => hookRow(hook, hands)),
    list(
      'views',
      details.views.map((ref) => view(ref, hands)),
    ),
  );
}

function propRow(details: ViewDetails, prop: PropDetails, hands: Hands) {
  return row(
    prop.name,
    editable(
      prop.value,
      (value) => ({ event: 'setProp', payload: { view: details.view, prop: prop.name, value } }),
      hands,
    ),
    prop.binding
      ? h(
          'span',
          { class: 'chips' },
          prop.binding.signals.length ? null : h('span', { class: 'kind' }, 'binding, no signals'),
          ...prop.binding.signals.map((ref) => signal(ref, hands)),
        )
      : h('span', { class: 'kind' }, 'constant'),
  );
}

function viewSection(details: ViewDetails, hands: Hands) {
  return section(
    `${details.kind} #${details.view}`,
    () => hands.select({ view: null }),
    row('label', h('code', {}, details.label)),
    details.component ? row('rendered by', component(details.component, hands)) : null,
    details.parent ? row('parent', view(details.parent, hands)) : null,
    list(
      'children',
      details.children.map((child) => view(child, hands)),
    ),
    h('h3', {}, 'Props'),
    ...details.props.map((prop) => propRow(details, prop, hands)),
  );
}

function drive(item: Drive, hands: Hands) {
  return view(item, hands, '.' + item.prop);
}

function branch(item: Branch, hands: Hands) {
  return item.component
    ? component(item.component, hands)
    : h('span', { class: 'chip' }, 'module ' + item.module);
}

function signalSection(details: SignalDetails, hands: Hands) {
  return section(
    `${details.name} (${details.kind})`,
    () => hands.select({ signal: null }),
    row(
      'value',
      details.kind === 'computed'
        ? h('code', {}, text(details.value))
        : editable(
            details.value,
            (value) => ({ event: 'setSignal', payload: { signal: details.signal, value } }),
            hands,
          ),
    ),
    details.owner ? row('owner', component(details.owner, hands)) : null,
    list(
      'drives',
      details.drives.map((item) => drive(item, hands)),
    ),
    list(
      'decides',
      details.decides.map((item) => branch(item, hands)),
    ),
    details.drives.length || details.decides.length
      ? null
      : row('drives', h('span', { class: 'kind' }, 'nothing mounted reads it')),
  );
}

/** The tree in reading order: each component followed by its descendants, with its depth. */
function walk(tree: TreeNode[]): { node: TreeNode; depth: number }[] {
  const children = new Map<number | null, TreeNode[]>();

  tree.forEach((node) => children.set(node.parent, [...(children.get(node.parent) ?? []), node]));

  const below = (parent: number | null, depth: number): { node: TreeNode; depth: number }[] =>
    (children.get(parent) ?? []).flatMap((node) => [{ node, depth }, ...below(node.id, depth + 1)]);

  return below(null, 0);
}

/** The kept writes, newest first. */
function historySection(state: PanelState, hands: Hands) {
  const { history } = state;

  return section(
    'History',
    () => hands.history(false),
    history && history.dropped
      ? h('p', { class: 'kind' }, `${history.dropped} older writes are no longer kept.`)
      : null,
    history && !history.writes.length
      ? h('p', { class: 'kind' }, 'No state was written yet.')
      : null,
    ...(history?.writes ?? [])
      .slice()
      .reverse()
      .map((write) =>
        row(
          `#${write.index}`,
          h('code', {}, `${write.name} = ${text(write.value)}`),
          write.owner ? component(write.owner, hands) : null,
        ),
      ),
  );
}

function treePane(state: PanelState, hands: Hands) {
  return h(
    'nav',
    {},
    ...walk(state.tree).map(({ node, depth }) =>
      h(
        'button',
        {
          class: node.id === state.selection.component ? 'node selected' : 'node',
          style: `padding-left: ${8 + depth * 14}px`,
          onclick: () => hands.select({ component: node.id, view: null, signal: null }),
          onmouseenter: () => hands.send({ event: 'highlightComponent', payload: { id: node.id } }),
          onmouseleave: () => hands.send({ event: 'clearHighlight' }),
        },
        node.name,
        node.key === null ? null : h('span', { class: 'key' }, ` key=${node.key}`),
      ),
    ),
  );
}

export function render(state: PanelState, hands: Hands): Node[] {
  return [
    h(
      'header',
      {},
      h(
        'button',
        {
          'aria-pressed': String(state.inspecting),
          title: 'Tap a view on the device to select it',
          onclick: () => hands.inspect(!state.inspecting),
        },
        state.inspecting ? 'Tap a view on the device…' : 'Select on device',
      ),
      h(
        'button',
        {
          'aria-pressed': String(state.showsHistory),
          title: 'The last signal writes',
          onclick: () => hands.history(!state.showsHistory),
        },
        'History',
      ),
      h('span', { class: 'status' }, state.status),
    ),
    h(
      'main',
      {},
      treePane(state, hands),
      h(
        'div',
        { class: 'details' },
        state.showsHistory ? historySection(state, hands) : null,
        state.signal ? signalSection(state.signal, hands) : null,
        state.view ? viewSection(state.view, hands) : null,
        state.component ? componentSection(state.component, hands) : null,
        state.signal || state.view || state.component || state.showsHistory
          ? null
          : h('p', { class: 'empty' }, 'Select a component, or a view on the device.'),
      ),
    ),
  ];
}
