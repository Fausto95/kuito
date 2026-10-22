import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { flushed, installKernel, type HostView, type Signal } from './support/kuito-host.ts';
import { handleOf, hosting } from './support/host-wire.ts';
import type {
  ComponentDetails,
  KernelMessage,
  PanelMessage,
  SignalDetails,
  TreeNode,
  ViewDetails,
} from '../src/runtime/devtools-protocol.ts';

/** Each answer's payload, by event. */
type Answers = {
  [M in Exclude<KernelMessage, { event: 'hello' }> as M['event']]: M['payload'];
};

/** The panel's tree, printed one component per line, indented under its parent. */
function print(nodes: TreeNode[]): string[] {
  const lines = (parent: number | null, depth: number): string[] =>
    nodes
      .filter((node) => node.parent === parent)
      .flatMap((node) => [
        ' '.repeat(depth * 2) + (node.key === null ? node.name : `${node.name} key=${node.key}`),
        ...lines(node.id, depth + 1),
      ]);

  return lines(null, 0);
}

/** The test app, rendered. */
function app() {
  const sent: KernelMessage[] = [];
  const commands: [string, string, string][] = [];
  const nodes = new Map<string, HostView>();
  const ctx = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        nodes.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, key: string, value: unknown) {
        present(nodes.get(id), id).props[key] = value;
      },
      removeView(id: string) {
        nodes.delete(id);
      },
      command(id: string, name: string, argument: string) {
        commands.push([id, name, argument]);
      },
      __kuitoHostDevtools(message: string) {
        sent.push(JSON.parse(message));
      },
    }),
  );
  const devtools = (ctx as unknown as { __kuitoDevtools: { receive(message: string): void } })
    .__kuitoDevtools;
  const send = (message: PanelMessage) => devtools.receive(JSON.stringify(message));
  const take = () => sent.splice(0);

  /** The one answer of `event` the kernel sent since the last take. */
  function answer<E extends keyof Answers>(event: E): Answers[E] {
    const found = take().filter((message) => message.event === event);

    assert.equal(found.length, 1, `one ${event} answer`);

    const [message] = found;

    return (message && 'payload' in message ? message.payload : undefined) as never;
  }

  let showB: Signal<boolean> | undefined;
  let visits: Signal<number> | undefined;

  function Counter(props: { label: string }) {
    const count = ctx.__kuito.useState(1, 'visits');

    if (props.label === 'a') visits = count;
    // Unnamed: code the compiler did not see.
    ctx.__kuito.useState('idle');

    return ctx.__kuitoJSX(
      'Text',
      { id: 'label-' + props.label },
      ctx.__kuitoExpr('label', () => props.label + count.value),
    );
  }

  function App() {
    const show = ctx.__kuito.useState(true, 'showB');

    showB = show;

    return ctx.__kuitoJSX(
      'VStack',
      { id: 'root' },
      ctx.__kuitoJSX(Counter as never, { key: 'a', label: 'a' }),
      ctx.__kuitoExpr('b', () =>
        show.value ? ctx.__kuitoJSX(Counter as never, { key: 'b', label: 'b' }) : null,
      ),
    );
  }

  ctx.__kuito.defineComponent('demo/app#App', App as never, 'app', true);
  ctx.__kuito.defineComponent('demo/app#Counter', Counter as never, 'counter', true);

  ctx.__kuito.patch('kuito.app', (api) => api.render(ctx.__kuitoJSX(App, {})));

  /** What the kernel told the shell while the app started. */
  const started = commands.splice(0);

  /** The JSON list of views a highlight command names: their numbers. */
  const views = (...labels: string[]) =>
    JSON.stringify(labels.map((label) => handleOf(ctx.__kuito, label)));

  /** Connects a panel and returns the tree it receives. */
  function connect() {
    take();
    send({ event: 'connect' });

    return answer('tree').components;
  }

  const idOf = (tree: TreeNode[], name: string, key: string | null = null) =>
    present(
      tree.find((node) => node.name === name && node.key === key),
      name,
    ).id;

  return {
    started,
    views,
    ctx,
    sent,
    commands,
    nodes,
    send,
    /** A message as the panel's socket carries it, even one the protocol has no type for. */
    receive: (message: unknown) => devtools.receive(JSON.stringify(message)),
    take,
    answer,
    connect,
    idOf,
    handle: (label: string) => handleOf(ctx.__kuito, label),
    signals: () => ({ showB: present(showB, 'showB'), visits: present(visits, 'visits') }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the kernel greets a panel on start, and stays quiet until one connects', () => {
  const { take } = app();

  assert.deepEqual(take(), [{ event: 'hello' }]);
});

test('a connected panel gets the component tree, named and keyed', () => {
  const { connect } = app();

  assert.deepEqual(print(connect()), ['App', '  Counter key=a', '  Counter key=b']);
});

test('the tree follows the app: what unmounts and mounts reaches the panel', async () => {
  const { connect, answer, signals } = app();

  connect();

  signals().showB.value = false;
  await settle();
  assert.deepEqual(print(answer('tree').components), ['App', '  Counter key=a']);

  signals().showB.value = true;
  await settle();
  assert.deepEqual(print(answer('tree').components), ['App', '  Counter key=a', '  Counter key=b']);
});

test('inspecting a component shows its props, its hooks by name, its owners and its views', () => {
  const { connect, send, answer, idOf, handle } = app();
  const tree = connect();

  send({ event: 'inspectComponent', payload: { id: idOf(tree, 'Counter', 'a') } });

  const component: ComponentDetails = present(answer('component'), 'component');

  assert.equal(component.name, 'Counter');
  assert.equal(component.key, 'a');
  assert.deepEqual(component.props, { label: 'a' });

  // The compiler names each signal after its variable; one it did not see shows its slot.
  assert.deepEqual(
    component.hooks.map((hook) => [hook.kind, hook.name, hook.kind === 'state' && hook.value]),
    [
      ['state', 'visits', 1],
      ['state', 'state 1', 'idle'],
    ],
  );

  assert.deepEqual(
    component.owners.map((owner) => owner.name),
    ['App'],
  );

  assert.deepEqual(
    component.views.map((view) => view.view),
    [handle('label-a')],
  );

  send({ event: 'inspectComponent', payload: { id: 999 } });

  assert.equal(answer('component'), null);
});

test('selecting a Text shows its text binding and the signals it last read, with their owners', () => {
  const { connect, send, answer, handle, idOf } = app();
  const tree = connect();

  send({ event: 'inspectView', payload: { view: handle('label-a') } });

  const view: ViewDetails = present(answer('view'), 'view');

  assert.equal(view.kind, 'Text');
  assert.equal(view.label, 'label-a');
  assert.equal(view.component?.id, idOf(tree, 'Counter', 'a'));

  const text = present(
    view.props.find((prop) => prop.name === 'text'),
    'text prop',
  );

  assert.equal(text.value, 'a1');

  assert.deepEqual(
    present(text.binding, 'text binding').signals.map((signal) => ({
      name: signal.name,
      value: signal.value,
      owner: signal.owner?.name,
      key: signal.owner?.key,
    })),
    [{ name: 'visits', value: 1, owner: 'Counter', key: 'a' }],
  );

  send({ event: 'inspectView', payload: { view: 999 } });

  assert.equal(answer('view'), null);
});

test('selecting a signal shows everything it drives: bindings, and branches it decides', () => {
  const { connect, send, answer, handle, idOf } = app();
  const tree = connect();
  const signalOf = (component: number, name: string) => {
    send({ event: 'inspectComponent', payload: { id: component } });

    const hook = present(
      present(answer('component'), 'component').hooks.find((each) => each.name === name),
      name,
    );

    assert.equal(hook.kind, 'state');

    return hook.kind === 'state' ? hook.signal : -1;
  };

  send({
    event: 'inspectSignal',
    payload: { signal: signalOf(idOf(tree, 'Counter', 'a'), 'visits') },
  });

  const visits: SignalDetails = present(answer('signal'), 'signal');

  assert.equal(visits.name, 'visits');
  assert.equal(visits.owner?.name, 'Counter');

  assert.deepEqual(visits.drives, [
    { view: handle('label-a'), kind: 'Text', label: 'label-a', prop: 'text' },
  ]);

  assert.deepEqual(visits.decides, []);

  send({ event: 'inspectSignal', payload: { signal: signalOf(idOf(tree, 'App'), 'showB') } });

  const showB: SignalDetails = present(answer('signal'), 'signal');

  assert.deepEqual(showB.drives, []);

  assert.deepEqual(
    showB.decides.map((branch) => branch.component?.name),
    ['App'],
  );

  send({ event: 'inspectSignal', payload: { signal: 999 } });

  assert.equal(answer('signal'), null);
});

test('editing a signal in the panel writes it, as app code would', async () => {
  const { connect, send, answer, idOf, nodes, signals } = app();
  const tree = connect();

  send({ event: 'inspectComponent', payload: { id: idOf(tree, 'Counter', 'a') } });

  const hook = present(answer('component'), 'component').hooks[0];

  assert.equal(hook?.kind, 'state');

  send({
    event: 'setSignal',
    payload: { signal: hook.kind === 'state' ? hook.signal : -1, value: 5 },
  });

  await settle();

  assert.equal(signals().visits.value, 5);
  assert.equal(nodes.get('label-a')?.props.text, 'a5');
});

test('editing a view prop sets it on the native view until its binding writes it again', async () => {
  const { connect, send, handle, nodes, signals } = app();

  connect();
  send({ event: 'setProp', payload: { view: handle('label-a'), prop: 'text', value: 'edited' } });

  assert.equal(nodes.get('label-a')?.props.text, 'edited');

  signals().visits.value = 3;
  await flushed();

  assert.equal(nodes.get('label-a')?.props.text, 'a3');
});

test('task, resource and motion hooks show their state; a motion value takes an edit', async () => {
  const sent: KernelMessage[] = [];
  const ctx = installKernel(
    hosting({
      __kuitoHostDevtools(message: string) {
        sent.push(JSON.parse(message));
      },
    }),
  );
  const devtools = (ctx as unknown as { __kuitoDevtools: { receive(message: string): void } })
    .__kuitoDevtools;
  const send = (message: PanelMessage) => devtools.receive(JSON.stringify(message));
  let offset: { value: unknown } | undefined;

  function Feed() {
    ctx.__kuito.useResource(async () => ['first'], 'items');
    ctx.__kuito.useTask(async () => 'saved', undefined, 'save');
    offset = ctx.__kuito.useMotion(0, 'offset');

    return ctx.__kuitoJSX('VStack', {});
  }

  ctx.__kuito.defineComponent('demo/feed#Feed', Feed as never, 'feed', true);
  ctx.__kuito.patch('kuito.app', (api) => api.render(ctx.__kuitoJSX(Feed as never, {})));
  await settle();
  await settle();

  send({ event: 'connect' });

  const tree = present(
    sent.find((message) => message.event === 'tree'),
    'tree',
  );
  const feed = tree.event === 'tree' ? present(tree.payload.components[0], 'Feed').id : -1;

  sent.length = 0;
  send({ event: 'inspectComponent', payload: { id: feed } });

  const inspected = present(sent[0], 'answer');
  const hooks = inspected.event === 'component' ? present(inspected.payload, 'Feed').hooks : [];

  assert.deepEqual(
    hooks.map((hook) => {
      if (hook.kind === 'task')
        return {
          kind: hook.kind,
          name: hook.name,
          running: hook.running,
          data: hook.data,
          error: hook.error,
        };

      if (hook.kind === 'motion') return { kind: hook.kind, name: hook.name, value: hook.value };

      return { kind: hook.kind, name: hook.name };
    }),
    [
      { kind: 'task', name: 'items', running: false, data: ['first'], error: null },
      { kind: 'task', name: 'save', running: false, data: null, error: null },
      { kind: 'motion', name: 'offset', value: 0 },
    ],
  );

  const motion = hooks.find((hook) => hook.kind === 'motion');

  send({
    event: 'setMotion',
    payload: { motion: motion?.kind === 'motion' ? motion.motion : '', value: 40 },
  });

  assert.equal(present(offset, 'offset').value, 40);
});

test('highlighting a component outlines the views it rendered; a view outlines itself', () => {
  const { connect, send, idOf, commands, views, handle } = app();
  const tree = connect();

  send({ event: 'highlightComponent', payload: { id: idOf(tree, 'Counter', 'b') } });
  send({ event: 'highlightView', payload: { view: handle('label-a') } });
  send({ event: 'clearHighlight' });

  assert.deepEqual(commands, [
    ['', 'devtoolsHighlight', views('label-b')],
    ['', 'devtoolsHighlight', views('label-a')],
    ['', 'devtoolsHighlight', '[]'],
  ]);
});

test('a layout-only view has no native view to outline: its children are outlined', () => {
  const { connect, send, idOf, commands, views } = app();

  send({ event: 'highlightComponent', payload: { id: idOf(connect(), 'App') } });

  assert.deepEqual(commands, [['', 'devtoolsHighlight', views('label-a', 'label-b')]]);
});

test('tapping a view while inspecting selects it, and the component that rendered it', () => {
  const { ctx, connect, take, send, idOf, commands, views, handle } = app();
  const tree = connect();

  send({ event: 'startInspecting' });

  ctx.__kuito.dispatch(0, 'devtools.select', JSON.stringify({ view: handle('label-b') }));

  assert.deepEqual(commands, [
    ['', 'devtoolsInspect', 'on'],
    ['', 'devtoolsInspect', 'off'],
    ['', 'devtoolsHighlight', views('label-b')],
  ]);

  assert.deepEqual(take(), [
    {
      event: 'selected',
      payload: { view: handle('label-b'), component: idOf(tree, 'Counter', 'b') },
    },
  ]);

  send({ event: 'startInspecting' });
  send({ event: 'stopInspecting' });

  assert.deepEqual(commands.slice(3), [
    ['', 'devtoolsInspect', 'on'],
    ['', 'devtoolsInspect', 'off'],
  ]);
});

test('a panel that shuts down hears nothing more', async () => {
  const { connect, take, send, signals } = app();

  connect();
  send({ event: 'shutdown' });
  signals().showB.value = false;
  await settle();

  assert.deepEqual(take(), []);
});

test('__kuito.stats counts each re-plan and the work between them', async () => {
  const { ctx, signals } = app();
  const first = ctx.__kuito.stats();

  assert.equal(first.replans, 1);
  assert.ok(first.lastReplan.thunkEvaluations > 0, 'the plan evaluates its expressions');
  assert.ok(first.lastReplan.subscriptionsCreated > 0, 'the plan subscribes its bindings');
  assert.ok(first.lastReplan.sendPropCalls > 0, 'the commit sends props');
  assert.deepEqual(first.total, first.lastReplan);

  // A bound text follows its signal without a re-plan: one evaluation, one
  // prop, and the subscription it had.
  signals().visits.value = 2;
  await flushed();

  const written = ctx.__kuito.stats();

  assert.equal(written.replans, 1);
  assert.deepEqual(written.lastReplan, first.lastReplan);

  assert.deepEqual(
    {
      thunkEvaluations: written.total.thunkEvaluations - first.total.thunkEvaluations,
      subscriptionsCreated: written.total.subscriptionsCreated - first.total.subscriptionsCreated,
      subscriptionsDestroyed:
        written.total.subscriptionsDestroyed - first.total.subscriptionsDestroyed,
      sendPropCalls: written.total.sendPropCalls - first.total.sendPropCalls,
      bytesStringified: written.total.bytesStringified - first.total.bytesStringified,
    },
    {
      thunkEvaluations: 1,
      subscriptionsCreated: 0,
      subscriptionsDestroyed: 0,
      sendPropCalls: 1,
      bytesStringified: 0,
    },
  );

  // Hiding a branch re-plans the module and drops the branch's subscriptions.
  signals().showB.value = false;
  await settle();

  const hidden = ctx.__kuito.stats();

  assert.equal(hidden.replans, 2);
  assert.ok(hidden.lastReplan.subscriptionsDestroyed > 0, 'the old plan unsubscribes');

  // Structured values cross the host boundary as JSON, counted by length.
  ctx.__kuito.accessibility.announce('Saved');

  const announced = ctx.__kuito.stats();

  assert.equal(
    announced.total.bytesStringified - hidden.total.bytesStringified,
    JSON.stringify({ message: 'Saved', queue: false }).length,
  );
});

test('__kuito.stats counts the JSON the kernel parses from the host, and live in __kuito.work', () => {
  const { ctx, handle } = app();
  const before = ctx.__kuito.stats().total.jsonParses;

  ctx.__kuito.dispatch(handle('label-a'), 'layout', JSON.stringify({ width: 10, height: 4 }));
  ctx.__kuito.dispatch(handle('label-a'), 'press');

  assert.equal(ctx.__kuito.stats().total.jsonParses - before, 1, 'only a payload is parsed');
  assert.equal(ctx.__kuito.work.jsonParses, ctx.__kuito.stats().total.jsonParses);
  assert.equal(ctx.__kuito.work.bytesStringified, ctx.__kuito.stats().total.bytesStringified);
});

test('a new runtime asks the shell whether it highlights updates', () => {
  const { started } = app();

  assert.deepEqual(
    started.filter(([, name]) => name === 'devtoolsHello'),
    [['', 'devtoolsHello', '']],
  );
});

test('while the shell highlights updates, each updated view names the signal write behind it', async () => {
  const { ctx, commands, signals, handle } = app();
  const causes = () => commands.filter(([, name]) => name === 'devtoolsCause');

  signals().visits.value = 2;
  await settle();
  assert.deepEqual(causes(), [], 'nothing while the highlighter is off');

  ctx.__kuito.dispatch(0, 'devtools.updates', JSON.stringify({ on: true }));
  signals().visits.value = 3;
  await settle();

  assert.deepEqual(causes(), [
    ['', 'devtoolsCause', JSON.stringify([handle('label-a'), 'visits = 3'])],
  ]);

  ctx.__kuito.dispatch(0, 'devtools.updates', JSON.stringify({ on: false }));
  signals().visits.value = 4;
  await settle();
  assert.equal(causes().length, 1);
});

test('a re-plan names the write that decided it, a computed the write beneath it', async () => {
  const commands: [string, string, string][] = [];
  const ctx = installKernel(
    hosting({
      command(id: string, name: string, argument: string) {
        if (name === 'devtoolsCause') commands.push([id, name, argument]);
      },
      __kuitoHostDevtools() {},
    }),
  );
  let query: Signal<string> | undefined;

  function Search() {
    const typed = ctx.__kuito.useState('', 'query');
    const upper = ctx.__kuito.computed(() => typed.value.toUpperCase());

    query = typed;

    return ctx.__kuitoJSX(
      'VStack',
      { id: 'search' },
      ctx.__kuitoJSX(
        'Text',
        { id: 'echo' },
        ctx.__kuitoExpr('echo', () => upper.value),
      ),
      ctx.__kuitoExpr('hint', () =>
        typed.value.length > 2 ? ctx.__kuitoJSX('Text', { id: 'hint', text: 'Searching' }) : null,
      ),
    );
  }

  ctx.__kuito.defineComponent('demo/search#Search', Search as never, 'search', true);
  ctx.__kuito.patch('kuito.app', (api) => api.render(ctx.__kuitoJSX(Search as never, {})));
  ctx.__kuito.dispatch(0, 'devtools.updates', JSON.stringify({ on: true }));

  present(query, 'query').value = 'abc';
  await settle();

  assert.deepEqual(commands, [
    ['', 'devtoolsCause', JSON.stringify([handleOf(ctx.__kuito, 'echo'), 'query = "abc"'])],
    ['', 'devtoolsCause', JSON.stringify([handleOf(ctx.__kuito, 'hint'), 'query = "abc"'])],
  ]);
});

test('the panel shows the write behind each prop it last updated', async () => {
  const { connect, send, answer, handle, signals } = app();

  connect();
  signals().visits.value = 9;
  await settle();
  send({ event: 'inspectView', payload: { view: handle('label-a') } });

  const props = present(answer('view'), 'view').props;

  assert.deepEqual(
    props.filter((prop) => prop.cause !== null).map((prop) => [prop.name, prop.cause]),
    [['text', 'visits = 9']],
  );
});

test('the kernel keeps the writes of each state signal, newest last, for the panel', async () => {
  const { connect, send, answer, signals } = app();

  connect();
  signals().visits.value = 2;
  signals().showB.value = false;
  await settle();
  send({ event: 'history' });

  const history = present(answer('history'), 'history');

  assert.equal(history.dropped, 0);

  assert.deepEqual(
    history.writes.map((write) => [write.name, write.value, write.owner?.name]),
    [
      ['visits', 2, 'Counter'],
      ['showB', false, 'App'],
    ],
  );
});

test('the write log lists a write of any value, as the panel shows values', async () => {
  const { connect, send, answer, signals } = app();

  connect();
  signals().visits.value = (() => 3) as never;
  await settle();
  send({ event: 'history' });

  const [write] = present(answer('history'), 'history').writes;

  assert.deepEqual(Object.keys(present(write, 'write')).sort(), [
    'index',
    'name',
    'owner',
    'value',
  ]);

  assert.equal(write?.name, 'visits');
});

test('the panel cannot step back: the kernel refuses travel and never restarts the app', async () => {
  const { connect, send, receive, answer, signals, commands } = app();

  connect();
  signals().visits.value = 4;
  await settle();
  send({ event: 'history' });

  const [write] = present(answer('history'), 'history').writes;

  commands.length = 0;
  receive({ event: 'travel', payload: { to: present(write, 'write').index } });

  assert.match(present(answer('refused'), 'refused').message, /Unknown panel message travel/);
  assert.deepEqual(commands, []);
});
