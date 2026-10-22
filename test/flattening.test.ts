import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { timing } from '../src/runtime/animation-specs.ts';
import { fade } from '../src/runtime/effects.ts';
import {
  flushed,
  installKernel,
  type PatchApi,
  type Props,
  type KuitoJSX,
} from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

type Call =
  | ['create', string, string, boolean]
  | ['flatten', string, boolean]
  | ['prop', string, string, unknown]
  | ['move', string, string, number]
  | ['remove', string];

/** A host that can flatten: it records every operation in order. */
function session() {
  const calls: Call[] = [];
  const flattened = new Map<string, boolean>();
  const context = installKernel(
    hosting({
      createView(id: string, kind: string, _parent: string, flat?: boolean) {
        assert.equal(flattened.has(id), false, `duplicate view ${id}`);
        flattened.set(id, flat === true);
        calls.push(['create', id, kind, flat === true]);
      },
      setFlattened(id: string, flat: boolean) {
        assert.notEqual(flattened.get(id), flat, `${id} is already ${flat ? 'flat' : 'a view'}`);
        flattened.set(id, flat);
        calls.push(['flatten', id, flat]);
      },
      setProp(id: string, name: string, value: unknown) {
        assert(flattened.has(id), `view must exist: ${id}`);
        calls.push(['prop', id, name, value]);
      },
      moveView(id: string, parent: string, index: number) {
        calls.push(['move', id, parent, index]);
      },
      removeView(id: string) {
        flattened.delete(id);
        calls.push(['remove', id]);
      },
    }),
  );
  const jsx: KuitoJSX = (type, props, ...children) => context.__kuitoJSX(type, props, ...children);
  const render = (tree: (api: PatchApi) => unknown) =>
    context.__kuito.patch('screen', (api) => api.render(tree(api)));

  return { calls, flattened, context, jsx, render };
}

/** `<VStack id="outer"><Box id="box" {...box}><Text id="label" /></Box></VStack>` */
function card(s: ReturnType<typeof session>, box: Props) {
  s.render(() =>
    s.jsx(
      'VStack',
      { id: 'outer' },
      s.jsx('Box', { id: 'box', ...box }, s.jsx('Text', { id: 'label', text: 'Hi' })),
    ),
  );
}

test('containers that only group and position their children get no native view', () => {
  const s = session();

  s.render(() =>
    s.jsx(
      'VStack',
      { id: 'root', padding: 16, gap: 8 },
      s.jsx(
        'HStack',
        { id: 'row', justifyContent: 'space-between', flexGrow: 1 },
        s.jsx('Text', { id: 'title', text: 'A' }),
      ),
      s.jsx('Spacer', { id: 'spacer' }),
      s.jsx('Box', { id: 'box', width: 40, height: 40, margin: 4 }),
      s.jsx('Pressable', { id: 'press' }),
    ),
  );

  assert.deepEqual(
    s.calls.filter((call) => call[0] === 'create'),
    [
      ['create', 'root', 'VStack', true],
      ['create', 'row', 'HStack', true],
      ['create', 'title', 'Text', false],
      ['create', 'spacer', 'Spacer', true],
      ['create', 'box', 'Box', true],
      ['create', 'press', 'Pressable', false],
    ],
  );

  // Layout props still reach the flattened node's layout.
  assert.deepEqual(
    s.calls.filter((call) => call[0] === 'prop' && call[1] === 'root'),
    [
      ['prop', 'root', 'padding', 16],
      ['prop', 'root', 'gap', 8],
    ],
  );
});

const forcing: Record<string, (s: ReturnType<typeof session>) => Props> = {
  background: () => ({ backgroundColor: '#ff0000' }),
  gradient: () => ({ backgroundGradient: { colors: ['#000000', '#ffffff'] } }),
  border: () => ({ borderWidth: 1 }),
  'border color': () => ({ borderColor: '#000000' }),
  'corner radius': () => ({ borderRadius: 8 }),
  shadow: () => ({ shadowColor: '#00000040', shadowRadius: 4 }),
  opacity: () => ({ opacity: 0.5 }),
  transform: () => ({ translateX: 4 }),
  'overflow clip': () => ({ overflow: 'hidden' }),
  visibility: () => ({ hidden: true }),
  transition: () => ({ transition: { opacity: { type: 'timing', duration: 200 } } }),
  'event handler': () => ({ onPress: () => undefined }),
  accessibility: () => ({ label: 'Card' }),
  'native id': () => ({ nativeID: 'card' }),
  'test id': () => ({ testID: 'card' }),
  ref: () => ({ ref: { current: null } }),
  'animated value': () => ({ width: timing().to(100) }),
  'enter effect': () => ({ enter: fade }),
};

for (const [name, props] of Object.entries(forcing))
  test(`a container keeps its native view for ${name}`, () => {
    const s = session();

    card(s, props(s));

    assert.deepEqual(
      s.calls.find((call) => call[0] === 'create' && call[1] === 'box'),
      ['create', 'box', 'Box', false],
    );
  });

test('a class with decoration keeps the native view; a layout-only class does not', () => {
  const s = session();

  s.context.__kuito.installStyles({ framed: { borderWidth: 1 }, spaced: { padding: 8 } });

  s.render(() =>
    s.jsx(
      'VStack',
      { id: 'root', class: 'spaced' },
      s.jsx('Box', { id: 'framed', class: 'framed' }),
    ),
  );

  assert.deepEqual(
    s.calls.filter((call) => call[0] === 'create'),
    [
      ['create', 'root', 'VStack', true],
      ['create', 'framed', 'Box', false],
    ],
  );
});

test('adding a view-forcing prop promotes the node in place, before the prop is set', () => {
  const s = session();
  const background = { value: '' };

  s.render(() =>
    s.jsx(
      'VStack',
      { id: 'outer' },
      s.jsx(
        'Box',
        background.value ? { id: 'box', backgroundColor: background.value } : { id: 'box' },
        s.jsx('Text', { id: 'label', text: 'Hi' }),
      ),
    ),
  );

  s.calls.length = 0;
  background.value = '#ff0000';

  s.render(() =>
    s.jsx(
      'VStack',
      { id: 'outer' },
      s.jsx(
        'Box',
        { id: 'box', backgroundColor: background.value },
        s.jsx('Text', { id: 'label', text: 'Hi' }),
      ),
    ),
  );

  // No remount: the children keep their native views and their order.
  assert.deepEqual(s.calls, [
    ['flatten', 'box', false],
    ['prop', 'box', 'backgroundColor', '#ff0000'],
  ]);
});

test('removing the last view-forcing prop clears it and then flattens the node', () => {
  const s = session();

  card(s, { backgroundColor: '#ff0000', padding: 4 });
  s.calls.length = 0;
  card(s, { padding: 4 });

  assert.deepEqual(s.calls, [
    ['prop', 'box', 'backgroundColor', null],
    ['flatten', 'box', true],
  ]);
});

test('an element handle that sets a view-forcing prop promotes its flattened node', () => {
  const s = session();
  let target: { parent: { setProperty(key: string, value: unknown): void } | null } | null = null;

  s.render(() =>
    s.jsx(
      'Box',
      { id: 'box' },
      s.jsx('Pressable', {
        id: 'press',
        onPress: (event: { target: typeof target }) => {
          target = event.target;
        },
      }),
    ),
  );

  nativeEvent(s.context.__kuito, 'press.press');
  s.calls.length = 0;
  target!.parent!.setProperty('opacity', 0.5);

  assert.deepEqual(s.calls, [
    ['flatten', 'box', false],
    ['prop', 'box', 'opacity', 0.5],
  ]);
});

test('a reactive layout prop that turns into an animation promotes the node', async () => {
  const s = session();
  let open: { value: boolean } = { value: false };

  s.render((api) => {
    open = api.state('open', false);

    return s.jsx('Box', {
      id: 'box',
      width: () => (open.value ? timing().to(200) : 100),
    });
  });

  assert.deepEqual(s.calls[0], ['create', 'box', 'Box', true]);
  s.calls.length = 0;
  open.value = true;
  await flushed();

  // No UI thread runs frames here: the width takes its target at once.
  assert.deepEqual(s.calls.slice(0, 2), [
    ['flatten', 'box', false],
    ['prop', 'box', 'width', 200],
  ]);
});

test('a press bubbles through flattened containers as through native ones', () => {
  const s = session();
  const path: string[] = [];

  s.render(() =>
    s.jsx(
      'VStack',
      {
        id: 'list',
        onPress: (event: { currentTarget: { id: string } }) => path.push(event.currentTarget.id),
      },
      s.jsx(
        'HStack',
        { id: 'row' },
        s.jsx('Pressable', { id: 'item', onPressCapture: () => path.push('capture') }),
      ),
    ),
  );

  assert.equal(s.flattened.get('row'), true);
  assert.equal(s.flattened.get('list'), false);
  nativeEvent(s.context.__kuito, 'item.press');
  assert.deepEqual(path, ['capture', 'list']);
  assert.equal(s.context.__kuito.view('row')?.parent, 'list');
});

test('a flattened node and its children move and remount like native views', () => {
  const s = session();
  const order = { value: ['a', 'b'] };
  const tree = () =>
    s.jsx(
      'VStack',
      { id: 'root' },
      ...order.value.map((id) =>
        s.jsx('HStack', { id, key: id }, s.jsx('Text', { id: id + '-label', text: id })),
      ),
    );

  s.render(tree);
  s.calls.length = 0;
  order.value = ['b', 'a'];
  s.render(tree);

  assert.deepEqual(s.calls, [['move', 'b', 'root', 0]]);
});

test('a layout prop the UI thread drives from a motion value keeps the view', () => {
  const s = session();
  const host = Object.assign(s.context, {
    ui() {},
    uiScript() {},
    __kuitoHostMotionRead: () => '',
  });
  const kernel = host.__kuito as typeof host.__kuito & {
    useMotion(initial: number): { value: number };
  };

  s.render(() =>
    host.__kuitoJSX(() => s.jsx('Box', { id: 'box', width: kernel.useMotion(100) }), {}),
  );

  assert.deepEqual(
    s.calls.find((call) => call[0] === 'create' && call[1] === 'box'),
    ['create', 'box', 'Box', false],
  );
});
