import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { componentPass } from '../src/dev/components/index.ts';
import { render } from '../src/dev/edits.ts';
import { parseModule } from '../src/dev/parse.ts';
import { present } from './support/present.ts';
import { flushed, installKernel, type HostView, type KuitoGlobals } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

/** The component pass alone over `code`, applied. */
function transform(code: string, filename = 'Counter.tsx') {
  const pass = componentPass(parseModule(filename, code));

  return { ...render(code, filename, pass.edits), components: pass.components };
}

function session() {
  const views = new Map<string, HostView>();
  const ops: unknown[][] = [];
  const context = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        assert.ok(!views.has(id), `duplicate ${id}`);
        views.set(id, { kind, parent, props: {} });
        ops.push(['create', id]);
      },
      setProp(id: string, name: string, value: unknown) {
        assert.ok(views.has(id), `missing ${id}`);
        present(views.get(id), id).props[name] = value;
        ops.push(['prop', id, name, value]);
      },
      removeView(id: string) {
        views.delete(id);
        ops.push(['remove', id]);
      },
    }),
  );

  return { context, views, ops };
}

function renderCounter(context: KuitoGlobals, { step = 1, prefix = 'Count: ', count = 1 } = {}) {
  const { __kuito, __kuitoJSX } = context;
  const VStack = 'VStack';
  const Text = 'Text';
  const Button = 'Button';

  function Counter() {
    const clicks = __kuito.useState(0);

    return __kuitoJSX(
      VStack,
      { gap: 16 },
      __kuitoJSX(Text, null, prefix, () => clicks.value),
      __kuitoJSX(
        Button,
        {
          onPress: () => {
            clicks.value += step;
          },
        },
        'Increment',
      ),
    );
  }

  function App() {
    return __kuitoJSX(
      VStack,
      { gap: 8 },
      ...Array.from({ length: count }, () => __kuitoJSX(Counter, {})),
    );
  }

  __kuito.patch('kuito.app', (api) => api.render(__kuitoJSX(App, {})));
}

type Session = ReturnType<typeof session>;

function find(session: Session, kind: string) {
  return [...session.views].filter(([, value]) => value.kind === kind);
}

test('normal components produce native nodes, reactive text and stable state after refresh', () => {
  const s = session();

  renderCounter(s.context);
  assert.equal(find(s, 'VStack').length, 2);
  assert.equal(find(s, 'Text')[0][1].props.text, 'Count: 0');

  const textId = find(s, 'Text')[0][0];
  const buttonId = find(s, 'Button')[0][0];

  nativeEvent(s.context.__kuito, buttonId + '.press');
  assert.equal(s.views.get(textId)?.props.text, 'Count: 1');

  const oldIds = [...s.views.keys()];
  const start = s.ops.length;

  renderCounter(s.context, { step: 2, prefix: 'Total: ' });
  assert.deepEqual([...s.views.keys()], oldIds);
  assert.equal(s.ops.slice(start).filter((x) => x[0] === 'create').length, 0);
  assert.equal(s.views.get(textId)?.props.text, 'Total: 1');

  const before = s.ops.length;

  nativeEvent(s.context.__kuito, buttonId + '.press');
  assert.equal(s.views.get(textId)?.props.text, 'Total: 3');
  assert.deepEqual(s.ops.slice(before), [['prop', textId, 'text', 'Total: 3']]);
});

test('component instances have isolated state by render path', () => {
  const s = session();

  renderCounter(s.context, { count: 2 });

  const labels = find(s, 'Text');
  const buttons = find(s, 'Button');

  assert.equal(labels.length, 2);
  assert.equal(buttons.length, 2);
  nativeEvent(s.context.__kuito, buttons[0][0] + '.press');
  assert.equal(s.views.get(labels[0][0])?.props.text, 'Count: 1');
  assert.equal(s.views.get(labels[1][0])?.props.text, 'Count: 0');
  renderCounter(s.context, { count: 2, prefix: 'Total: ' });
  assert.equal(s.views.get(labels[0][0])?.props.text, 'Total: 1');
  assert.equal(s.views.get(labels[1][0])?.props.text, 'Total: 0');
});

test('signal() outside component initialization throws explicitly', () => {
  const s = session();

  assert.throws(() => s.context.__kuito.useState(0), /during component initialization/);
});

test('compiler lazifies text expressions but not onPress event callbacks', () => {
  const transformed = transform(
    `const count = signal(0); const x = <Text>Count: {count.value}</Text>; const b = <Button onPress={() => count.value++} />;`,
  );

  assert.match(transformed.code, /__kuitoExpr\("[a-f0-9]{16}", \(\) => \(count\.value\)\)/);
  assert.match(transformed.code, /onPress=\{\(\) => count\.value\+\+\}/);
});

test('Oxc parses TSX and Kuito transforms signal reads in real syntax', () => {
  const code =
    'function Counter(){ const count = signal(0); return <VStack gap={16}><Text>Count: {count.value}</Text><Button onPress={() => count.value++}>Go</Button></VStack>; }';
  const transformed = transform(code);

  assert.match(transformed.code, /__kuitoExpr\("[a-f0-9]{16}", \(\) => \(count\.value\)\)/);
  assert.match(transformed.code, /onPress=\{\(\) => count\.value\+\+\}/);
});

test('the compiler names each signal after its variable, for the Components panel', () => {
  const code =
    'function Counter(){ const visits = signal(1); const items = signal([1, 2]); let quiet = signal(0); const later = makeState(); return <Text>{visits.value}</Text>; }';
  const transformed = transform(code, 'Counter.tsx');

  assert.match(transformed.code, /const visits = signal\(1, "visits"\)/);
  assert.match(transformed.code, /const items = signal\(\[1, 2\], "items"\)/);
  assert.match(transformed.code, /let quiet = signal\(0, "quiet"\)/);
  assert.match(transformed.code, /const later = makeState\(\)/);
});

test('the compiler names each hook after its variable and numbers the others', () => {
  const code =
    'function Card(){ const a = signal(0); const s = store({ n: 1 }); const m = motion(0); const r = ref(); const t = task(() => 1); ' +
    "const d = task(() => 1, { policy: 'drop' }); const res = resource(() => 1); onMount(() => {}); " +
    'effect(() => {}); effect(() => {}); watch(() => 1, () => {}); onCleanup(() => {}); return <Text />; }';
  const { code: out } = transform(code, 'Card.tsx');

  [
    'const a = signal(0, "a")',
    'const s = store({ n: 1 }, "s")',
    'const m = motion(0, "m")',
    'const r = ref("r")',
    'const t = task(() => 1, undefined, "t")',
    `const d = task(() => 1, { policy: 'drop' }, "d")`,
    'const res = resource(() => 1, "res")',
    'onMount(() => {}, "#1")',
    'effect(() => {}, "#1"); effect(() => {}, "#2")',
    'watch(() => 1, () => {}, undefined, "#1")',
    'onCleanup(() => {}, "#1")',
  ].forEach((expected) => assert.ok(out.includes(expected), expected + ' in ' + out));
});

test('the compiler names a top-level inherited() by its file and variable, and no other', () => {
  const code =
    "import { inherited } from 'kuito'; export const Accent = inherited('gray'); " +
    'const keys = { a: inherited(1) }; function make(f) { const Local = inherited(f); return Local; }';
  const { code: out } = transform(code, 'theme.tsx');

  assert.ok(out.includes(`inherited('gray', "theme.tsx#Accent")`), out);
  assert.ok(out.includes('{ a: inherited(1) }'), 'a key in an object is not named: ' + out);
  assert.ok(out.includes('const Local = inherited(f);'), 'nor one a function makes: ' + out);
});

test('a hook inside an if keeps the name it has in the source', () => {
  const code =
    'function Card(props){ if (props.on) { const extra = signal(1); effect(() => {}); } effect(() => {}); return <Text />; }';
  const { code: out } = transform(code, 'Card.tsx');

  assert.ok(out.includes('const extra = signal(1, "extra")'), out);
  assert.ok(out.includes('effect(() => {}, "#1"); } effect(() => {}, "#2")'), out);
});

test('the compiler names a hook by the binding its callee resolves to', () => {
  const compile = (code: string) => transform(code, 'Counter.tsx').code;

  assert.ok(
    compile(
      "import { signal as count } from 'kuito';" +
        'function Counter() { const a = count(0); return <Text />; }',
    ).includes('const a = count(0, "a")'),
    'an alias of a Kuito hook is that hook',
  );

  const local = compile(
    "import { signal } from './store';" +
      'function effect() {}' +
      'function Counter() { const a = signal(0); effect(); return <Text />; }',
  );

  assert.ok(local.includes('const a = signal(0)'), local);
  assert.ok(local.includes('effect()'), 'a hook name bound to something else is not a hook');
});

test('Fast Refresh does not re-evaluate an unchanged Math.random JSX expression', () => {
  const s = session();
  const { __kuitoJSX: jsx, __kuito } = s.context;
  let calls = 0;

  function mount(buttonText: string, randomCode: string) {
    __kuito.patch('kuito.random-demo', (api) => {
      function App() {
        const count = __kuito.useState(0);

        return jsx(
          'VStack',
          { id: 'root' },
          jsx('Text', { id: 'count' }, 'Count:', () => count.value),
          jsx(
            'Text',
            { id: 'random' },
            'Hey',
            s.context.__kuitoExpr(randomCode, () => {
              calls++;
              return Math.random();
            }),
          ),
          jsx(
            'Button',
            {
              id: 'button',
              onPress: () => {
                count.value++;
              },
            },
            buttonText,
          ),
        );
      }

      api.render(jsx(App, {}));
    });
  }

  mount('Increment', 'random-expression-hash');

  const initial = present(s.views.get('random'), 'random').props.text;

  assert.equal(calls, 1);
  mount('Add one', 'random-expression-hash');
  assert.equal(s.views.get('random')?.props.text, initial);
  assert.equal(calls, 1, 'same expression must not execute again on an unrelated edit');
  nativeEvent(__kuito, 'button.press');
  assert.equal(s.views.get('count')?.props.text, 'Count:1');
  assert.equal(calls, 1);
  mount('Add one', 'changed-random-source-hash');
  assert.equal(calls, 2, 'changing random expression invalidates its cache');
});

test('compiler attaches fingerprints to automatic reactive JSX closures', () => {
  const result = transform('const t = <Text>Hey{Math.random()}</Text>;');

  assert.match(result.code, /__kuitoExpr\("[a-f0-9]{16}", \(\) => \(Math.random\(\)\)\)/);
});

test('a class read from a stylesheet passes as it is: it never changes', () => {
  const code = [
    "import css from './theme.css';",
    'const local = styles({ card: { padding: 4, variants: { tone: { warm: { opacity: 1 } } } } });',
    'const a = <VStack class={css.card} />;',
    "const b = <VStack class={[local.card, { tone: 'warm', size: null }]} />;",
    "const c = <VStack class={[css.card, local.card, 'plain', false]} />;",
    "const d = <VStack class={'plain'} />;",
  ].join('\n');
  const transformed = transform(code);

  assert.doesNotMatch(transformed.code, /__kuitoExpr/);
});

test('a class that reads anything but a stylesheet follows it', () => {
  const code = [
    "import css from './theme.css';",
    'const tone = signal(false);',
    'const a = <VStack class={tone.value ? css.warm : css.cold} />;',
    'const b = <VStack class={[css.card, tone.value && css.warm]} />;',
    'const c = <VStack class={css[tone.value ? "warm" : "cold"]} />;',
    'const d = (props) => <VStack class={props.css.card} />;',
    'const e = (css) => <VStack class={css.card} />;',
    "const f = <VStack class={[css.card, { tone: tone.value ? 'warm' : 'cold' }]} />;",
  ].join('\n');
  const transformed = transform(code);

  assert.equal(transformed.code.match(/__kuitoExpr\(/g)?.length, 6);
});

test('every on[A-Z] attribute is an event handler, including function references', () => {
  const code =
    'function Form(){ const name = signal(""); return <VStack><TextField onChangeText={setName} onSubmit={submit} /><Pressable label="Menu" onLongPress={menu} /><Text>{name.value}</Text></VStack>; }';
  const transformed = transform(code, 'Form.tsx');

  assert.match(transformed.code, /onChangeText=\{setName\}/);
  assert.match(transformed.code, /onSubmit=\{submit\}/);
  assert.match(transformed.code, /onLongPress=\{menu\}/);
  assert.match(transformed.code, /__kuitoExpr\("[a-f0-9]{16}", \(\) => \(name\.value\)\)/);
});

test('a component’s hash covers the module code it reads, and only that', () => {
  const hashes = (edit: { icon?: string; helper?: string; unused?: string } = {}) => {
    const code = [
      "import { Text } from 'kuito';",
      `const ICON = { uri: '${edit.icon ?? 'a.png'}' };`,
      `const UNUSED = ${edit.unused ?? 1};`,
      `function label() { return '${edit.helper ?? 'x'}'; }`,
      'function Other() { return <Text>other</Text>; }',
      'export default function App() { return <Text icon={ICON}>{label()}</Text>; }',
    ].join('\n');
    const { components } = transform(code, 'App.tsx');

    return Object.fromEntries(components.map((component) => [component.name, component.hash]));
  };
  const before = hashes();

  assert.notEqual(hashes({ icon: 'b.png' }).App, before.App, 'a constant it reads');
  assert.notEqual(hashes({ helper: 'y' }).App, before.App, 'a function it calls');
  assert.equal(hashes({ unused: '2' }).App, before.App, 'a constant it does not read');
  assert.equal(hashes({ icon: 'b.png' }).Other, before.Other, 'another component');
});

test('a binding follows the signals it read on its last run, not only its first', async () => {
  const { context, views } = session();
  const { __kuito, __kuitoJSX } = context;
  const signals: { on?: { value: boolean }; count?: { value: number }; size?: { value: number } } =
    {};

  __kuito.patch('branches', (api) =>
    api.render(
      __kuitoJSX(() => {
        const on = __kuito.useState(false);
        const count = __kuito.useState(0);
        const size = __kuito.useState(10);

        Object.assign(signals, { on, count, size });

        return __kuitoJSX(
          'Text',
          { id: 'label', fontSize: () => (on.value ? size.value : 12) },
          () => (on.value ? `on ${count.value}` : 'off'),
        );
      }, {}),
    ),
  );

  const { on, count, size } = signals;

  assert.ok(on && count && size);

  const label = () => present(views.get('label'), 'label').props;

  on.value = true;
  count.value = 5;
  size.value = 20;
  await flushed();

  assert.equal(label().text, 'on 5', 'text that started on the other branch');
  assert.equal(label().fontSize, 20, 'a prop that started on the other branch');

  on.value = false;
  count.value = 6;
  await flushed();

  assert.equal(label().text, 'off', 'a branch no longer taken stops mattering');
});

test('a binding kept across a patch keeps the signals its last run read', async () => {
  const { context, views } = session();
  const { __kuito, __kuitoJSX } = context;
  const signals: { on?: { value: boolean }; count?: { value: number } } = {};
  const App = () => {
    const on = __kuito.useState(false);
    const count = __kuito.useState(0);

    Object.assign(signals, { on, count });

    return __kuitoJSX(
      'Text',
      { id: 'label' },
      // As compiled: a keyed expression, which a kept instance reuses.
      context.__kuitoExpr('label-text', () => (on.value ? `on ${count.value}` : 'off')),
    );
  };

  __kuito.defineComponent('app#App', App, 'hash-1', true);

  const render = () => __kuito.patch('kept', (api) => api.render(__kuitoJSX(App, {})));

  render();

  const { on, count } = signals;

  assert.ok(on && count);

  on.value = true;
  await flushed();
  // Live Patch re-runs the module; the unchanged component keeps its bindings.
  render();
  count.value = 3;
  await flushed();

  assert.equal(present(views.get('label'), 'label').props.text, 'on 3');
});

test('a component’s hash ignores layout and comments, and reads helpers by binding', () => {
  const hash = (code: string) =>
    transform(code, 'App.tsx').components.find((component) => component.name === 'App')?.hash;

  assert.equal(
    hash('export default function App() {\n  // The title.\n  return (<Text text="x" />);\n}'),
    hash("export default function App() { return <Text text='x' />; }"),
    'layout, comments, parentheses and quotes',
  );

  assert.equal(
    hash(
      'export default function App() {\n  return (\n    <VStack>\n      <Text>\n        hi\n      </Text>\n    </VStack>\n  );\n}',
    ),
    hash('export default function App() { return <VStack><Text>hi</Text></VStack>; }'),
    'JSX indentation',
  );

  assert.notEqual(
    hash('export default function App() { return <Text>hi there</Text>; }'),
    hash('export default function App() { return <Text>hi  there</Text>; }'),
    'spaces inside JSX text are text',
  );

  const shadowing = (value: string) =>
    hash(
      `const title = '${value}';\n` +
        "export default function App() { const title = 'own'; return <Text text={title} />; }",
    );

  assert.equal(shadowing('b'), shadowing('a'), 'a module constant its own local shadows');
});

test('a Pressable with neither a label nor text children is a build error naming its line', () => {
  assert.throws(
    () =>
      transform(
        'function Player() {\n  return (\n    <Pressable onPress={play}>\n      <Symbol name="play" />\n    </Pressable>\n  );\n}',
        'Player.tsx',
      ),
    (error: Error & { loc?: { file: string; line: number } }) =>
      /Pressable.*label/.test(error.message) &&
      error.loc?.file === 'Player.tsx' &&
      error.loc.line === 3,
  );

  for (const ok of [
    '<Pressable label="Play" onPress={play}><Symbol name="play" /></Pressable>',
    '<Pressable onPress={play}><HStack><Text>Play</Text></HStack></Pressable>',
    '<Pressable onPress={play}><Card /></Pressable>',
    '<Pressable onPress={play}>{children}</Pressable>',
    '<Pressable {...rest} />',
    '<Pressable aria-hidden onPress={play}><Symbol name="star" /></Pressable>',
  ])
    assert.doesNotThrow(() => transform(`function A() { return ${ok}; }`, 'A.tsx'), ok);
});
