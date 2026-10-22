// The public reactivity API as an app uses it (docs/reactivity.md): signal,
// computed and watch, compiled by the real compiler and run in a
// kernel, and signals passed straight to props.
import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { present } from './support/present.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

// Inside the package, so `kuito` resolves to it as in an app.
const scratch = join(process.cwd(), 'dist');

async function compile(source: string) {
  mkdirSync(scratch, { recursive: true });

  const dir = mkdtempSync(join(scratch, 'reactivity-'));

  try {
    const entry = join(dir, 'app.tsx');

    writeFileSync(entry, source);

    return await createSourceCompiler({ platform: 'ios', outputDir: dir })(entry);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Compiles `source` as an app and runs it in a fresh kernel. */
async function run(source: string) {
  const views = new Map<string, { kind: string; props: Props }>();
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
        sent.push([id, name, value]);
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );
  const output = await compile(source);

  runInNewContext(output.code, host);

  return {
    host,
    views,
    sent,
    warnings: output.warnings.map(({ file, line, message }) => `${file}:${line} ${message}`),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const props = (views: Map<string, { props: Props }>, id: string) =>
  present(views.get(id), id).props;

test('signal() makes a component signal that its JSX follows', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, signal } from 'kuito';

    export default function App() {
      const count = signal(1);

      return [
        <Text id="label">Count: {count.value}</Text>,
        <Pressable id="add" onPress={() => count.value++} ><Text>Add</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'label').text, 'Count: 1');

  nativeEvent(host.__kuito, 'add.press');

  assert.equal(props(views, 'label').text, 'Count: 2');
});

test('a signal passed as a prop or a child binds it to the signal', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, signal } from 'kuito';

    export default function App() {
      const level = signal(0.5);
      const title = signal('Hello');

      return [
        <Text id="label" opacity={level}>{title}</Text>,
        <Pressable id="go" onPress={() => { level.value = 1; title.value = 'Bye'; }} ><Text>Go</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'label').opacity, 0.5);
  assert.equal(props(views, 'label').text, 'Hello');

  nativeEvent(host.__kuito, 'go.press');

  assert.equal(props(views, 'label').opacity, 1);
  assert.equal(props(views, 'label').text, 'Bye');
});

test('Show follows a signal passed as its condition', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, signal } from 'kuito';
    import { Show } from 'kuito';

    export default function App() {
      const open = signal(false);

      return [
        <Show when={open}><Text id="details">Details</Text></Show>,
        <Pressable id="toggle" onPress={() => (open.value = !open.value)} ><Text>Toggle</Text></Pressable>,
      ];
    }
  `);

  assert.equal(views.has('details'), false);

  nativeEvent(host.__kuito, 'toggle.press');
  await settle();

  assert.equal(views.has('details'), true);
});

test('computed() derives a signal that JSX follows', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, computed, signal } from 'kuito';

    export default function App() {
      const first = signal('Ada');
      const full = computed(() => first.value + ' Lovelace');

      return [
        <Text id="name">{full}</Text>,
        <Pressable id="rename" onPress={() => (first.value = 'Augusta Ada')}><Text>Rename</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'name').text, 'Ada Lovelace');

  nativeEvent(host.__kuito, 'rename.press');

  assert.equal(props(views, 'name').text, 'Augusta Ada Lovelace');
});

test('writes after an await reach the host as one change, without batch()', async () => {
  const { host, views, sent } = await run(`
    import { Pressable, Text, computed, signal } from 'kuito';

    export default function App() {
      const first = signal('Ada');
      const last = signal('Lovelace');
      const read = signal('');

      return [
        <Text id="name">{first.value + ' ' + last.value}</Text>,
        <Text id="read">{read.value}</Text>,
        <Pressable
          id="rename"
          onPress={async () => {
            await Promise.resolve();
            first.value = 'Grace';
            last.value = 'Hopper';
            read.value = computed(() => first.value + ' ' + last.value).value;
          }}
        ><Text>Rename</Text></Pressable>,
      ];
    }
  `);

  sent.length = 0;
  nativeEvent(host.__kuito, 'rename.press');
  await settle();

  assert.deepEqual(
    sent.filter(([id]) => id === 'name'),
    [['name', 'text', 'Grace Hopper']],
  );

  assert.equal(props(views, 'read').text, 'Grace Hopper', 'a read right after a write is current');
});

test('batch() is not part of the API: the kernel batches every write', async () => {
  await assert.rejects(
    compile(`
      import { Text, batch } from 'kuito';

      export default function App() {
        return <Text>{batch(() => 1)}</Text>;
      }
    `),
    /batch/,
  );
});

test('signal() outside a component is one signal every component shares', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, signal } from 'kuito';

    const shared = signal(0);

    function Counter(props: { id: string }) {
      return <Text id={props.id}>{shared.value}</Text>;
    }

    export default function App() {
      return [
        <Counter id="a" />,
        <Counter id="b" />,
        <Pressable id="add" onPress={() => shared.value++} ><Text>Add</Text></Pressable>,
      ];
    }
  `);

  nativeEvent(host.__kuito, 'add.press');

  assert.equal(props(views, 'a').text, '1');
  assert.equal(props(views, 'b').text, '1');
});

test('watch() outside a component follows a signal until removed', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, signal, watch } from 'kuito';

    const count = signal(0);
    const seen = signal('');
    const subscription = watch(count, (next, previous) => {
      seen.value += previous + '>' + next + ' ';
      if (next === 2) subscription.remove();
    });

    export default function App() {
      return [
        <Text id="seen">{seen.value}</Text>,
        <Pressable id="add" onPress={() => count.value++} ><Text>Add</Text></Pressable>,
      ];
    }
  `);

  nativeEvent(host.__kuito, 'add.press');
  nativeEvent(host.__kuito, 'add.press');
  nativeEvent(host.__kuito, 'add.press');

  assert.equal(props(views, 'seen').text, '0>1 1>2 ');
});

test('a task has running, data and error, and no second name for running', async () => {
  const { views } = await run(`
    import { Text, task } from 'kuito';

    export default function App() {
      const load = task(async () => 1);

      return <Text id="keys">{['running', 'pending'].filter((key) => key in load).join(',')}</Text>;
    }
  `);

  assert.equal(props(views, 'keys').text, 'running');
});

test('state() is gone: signal() replaces it', async () => {
  await assert.rejects(
    compile(`
      import { Text, state } from 'kuito';

      export default function App() {
        const count = state(0);

        return <Text>{count.value}</Text>;
      }
    `),
    /state/,
  );
});

test('the compiler warns about a .value read once in a component body', async () => {
  const { warnings } = await run(`
    import { Pressable, Text, signal } from 'kuito';

    export default function App() {
      const count = signal(0);
      const doubled = count.value * 2;
      const later = () => count.value;

      return [
        <Text id="label">{doubled}</Text>,
        <Pressable id="add" onPress={() => count.value + later()} ><Text>Add</Text></Pressable>,
      ];
    }
  `);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /app\.tsx:6/);
  assert.match(warnings[0], /count\.value/);
  assert.match(warnings[0], /computed\(\(\) =>/);
});

test('an expression that yields undefined leaves the prop unset', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, signal } from 'kuito';

    export default function App() {
      const dim = signal(true);

      return [
        <Text id="label" opacity={dim.value ? 0.5 : undefined}>Hi</Text>,
        <Pressable id="toggle" onPress={() => (dim.value = !dim.value)}><Text>Toggle</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'label').opacity, 0.5);

  nativeEvent(host.__kuito, 'toggle.press');

  assert.equal(props(views, 'label').opacity, null);
});

test('store() makes every path a signal: a write updates only the bindings that read it', async () => {
  const { host, views, sent } = await run(`
    import { Pressable, Text, store } from 'kuito';

    export default function App() {
      const shelf = store({ items: [{ title: 'Dune', liked: false }, { title: 'Emma', liked: false }] });

      return [
        <Text id="title-0">{shelf.items[0].title}</Text>,
        <Text id="liked-0">{shelf.items[0].liked ? 'liked' : 'not'}</Text>,
        <Text id="liked-1">{shelf.items[1].liked ? 'liked' : 'not'}</Text>,
        <Pressable id="like" onPress={() => (shelf.items[1].liked = true)}><Text>Like</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'liked-1').text, 'not');

  sent.length = 0;
  nativeEvent(host.__kuito, 'like.press');

  assert.deepEqual(sent, [['liked-1', 'text', 'liked']]);
});

test('a store array follows pushes, removals and replaced items', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, store } from 'kuito';

    export default function App() {
      const list = store({ names: ['a', 'b'] as string[] });

      return [
        <Text id="joined">{list.names.join(',') + ' (' + list.names.length + ')'}</Text>,
        <Pressable id="push" onPress={() => list.names.push('c')}><Text>Push</Text></Pressable>,
        <Pressable id="shift" onPress={() => list.names.shift()}><Text>Shift</Text></Pressable>,
        <Pressable id="replace" onPress={() => (list.names = ['z'])}><Text>Replace</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'joined').text, 'a,b (2)');

  nativeEvent(host.__kuito, 'push.press');
  assert.equal(props(views, 'joined').text, 'a,b,c (3)');

  nativeEvent(host.__kuito, 'shift.press');
  assert.equal(props(views, 'joined').text, 'b,c (2)');

  nativeEvent(host.__kuito, 'replace.press');
  assert.equal(props(views, 'joined').text, 'z (1)');
});

test('a store follows keys that come and go, and reads stay current after a write', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, store } from 'kuito';

    export default function App() {
      const tags = store<Record<string, number>>({ a: 1 });
      const read = store({ value: '' });

      return [
        <Text id="keys">{Object.keys(tags).join(',') + ('b' in tags ? ' has b' : '')}</Text>,
        <Text id="read">{read.value}</Text>,
        <Pressable
          id="add"
          onPress={() => {
            tags.b = 2;
            read.value = String(tags.b);
          }}
        ><Text>Add</Text></Pressable>,
        <Pressable id="remove" onPress={() => delete tags.a}><Text>Remove</Text></Pressable>,
      ];
    }
  `);

  assert.equal(props(views, 'keys').text, 'a');

  nativeEvent(host.__kuito, 'add.press');
  assert.equal(props(views, 'keys').text, 'a,b has b');
  assert.equal(props(views, 'read').text, '2');

  nativeEvent(host.__kuito, 'remove.press');
  assert.equal(props(views, 'keys').text, 'b has b');
});

test('a store keeps one proxy per object and stores plain data, not proxies', async () => {
  const { views } = await run(`
    import { Text, store } from 'kuito';

    export default function App() {
      const shelf = store({ items: [{ title: 'Dune' }] as { title: string }[], picked: null as null | { title: string } });

      shelf.picked = shelf.items[0];

      return [
        <Text id="same">{String(shelf.items[0] === shelf.items[0] && shelf.picked === shelf.items[0])}</Text>,
        <Text id="json">{JSON.stringify(shelf)}</Text>,
      ];
    }
  `);

  assert.equal(props(views, 'same').text, 'true');
  assert.equal(props(views, 'json').text, '{"items":[{"title":"Dune"}],"picked":{"title":"Dune"}}');
});

test('store() takes an object or an array', async () => {
  await assert.rejects(
    run(`
      import { Text, store } from 'kuito';

      export default function App() {
        const count = store(1 as never);

        return <Text>{String(count)}</Text>;
      }
    `),
    /store\(\) takes an object or an array/,
  );
});

test('For over a store array: a field write is one prop write, a reorder moves rows', async () => {
  const { host, views, sent } = await run(`
    import { For, Pressable, Scroll, Text, store } from 'kuito';

    const shelf = store({
      books: ['Dune', 'Emma', 'Ulysses'].map((title) => ({ title, liked: false })),
    });

    export default function App() {
      return [
        <Scroll id="scroll">
          <For each={shelf.books}>
            {(book, index) => <Text>{index.value + 1 + '. ' + book.title + (book.liked ? ' ♥' : '')}</Text>}
          </For>
        </Scroll>,
        <Pressable id="like" onPress={() => (shelf.books[1].liked = true)}><Text>Like</Text></Pressable>,
        <Pressable id="reverse" onPress={() => shelf.books.reverse()}><Text>Reverse</Text></Pressable>,
      ];
    }
  `);
  const rows = () =>
    [...views.values()]
      .map((view) => view.props.text)
      .filter((text) => typeof text === 'string' && /^\d\./.test(text))
      .sort((left, right) => String(left).localeCompare(String(right)));

  assert.deepEqual(rows(), ['1. Dune', '2. Emma', '3. Ulysses']);

  sent.length = 0;
  nativeEvent(host.__kuito, 'like.press');
  await settle();

  assert.equal(sent.length, 1, 'one prop write');
  assert.deepEqual(rows(), ['1. Dune', '2. Emma ♥', '3. Ulysses']);

  const count = views.size;

  sent.length = 0;
  nativeEvent(host.__kuito, 'reverse.press');
  await settle();

  assert.equal(views.size, count, 'no view created or removed');
  assert.deepEqual(rows(), ['1. Ulysses', '2. Emma ♥', '3. Dune']);
  assert.equal(sent.length, 2, 'the two rows whose index changed');
});

test('inherit() reads the nearest provide() above it and follows its signal alone', async () => {
  const { host, views, sent } = await run(`
    import { Pressable, Text, VStack, inherit, inherited, provide, signal } from 'kuito';

    const Accent = inherited('gray');
    const runs = { badge: 0 };

    function Badge(props: { id: string }) {
      const run = ++runs.badge;
      const accent = inherit(Accent);

      return <Text id={props.id}>{accent.value + ' ' + run}</Text>;
    }

    // Knows nothing of Accent: nothing is passed through it.
    function Section() {
      return <VStack><Badge id="nested" /></VStack>;
    }

    function Gold() {
      provide(Accent, 'gold');

      return <Badge id="inner" />;
    }

    export default function App() {
      const accent = signal('teal');

      provide(Accent, accent);

      return [
        <Section />,
        <Gold />,
        <Pressable id="recolor" label="Recolor" onPress={() => (accent.value = 'orange')} />,
      ];
    }
  `);

  assert.equal(props(views, 'nested').text, 'teal 1');
  assert.equal(props(views, 'inner').text, 'gold 2', 'the nearest provider wins');

  sent.length = 0;
  nativeEvent(host.__kuito, 'recolor.press');
  await settle();

  assert.equal(props(views, 'nested').text, 'orange 1', 'no component ran again');
  assert.equal(props(views, 'inner').text, 'gold 2');
  assert.deepEqual(sent, [['nested', 'text', 'orange 1']]);
});

test('inherit() with no provider above reads the fallback', async () => {
  const { views } = await run(`
    import { Text, inherit, inherited, provide } from 'kuito';

    const Accent = inherited('gray');

    // A component's own provide() is for its descendants, not for itself.
    export default function App() {
      provide(Accent, 'teal');

      const accent = inherit(Accent);

      return <Text id="own">{accent.value}</Text>;
    }
  `);

  assert.equal(props(views, 'own').text, 'gray');
});

test('a provider that runs again with another value reaches its readers', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, VStack, inherit, inherited, provide, signal } from 'kuito';

    const Mode = inherited('light');

    function Label() {
      const mode = inherit(Mode);

      return <Text id="mode">{mode.value}</Text>;
    }

    function Theme(props: { mode: string }) {
      provide(Mode, props.mode);

      return <Label />;
    }

    export default function App() {
      const dark = signal(false);

      return [
        <VStack>{dark.value ? <Theme mode="dark" /> : <Theme mode="light" />}</VStack>,
        <Pressable id="toggle" label="Toggle" onPress={() => (dark.value = !dark.value)} />,
      ];
    }
  `);

  assert.equal(props(views, 'mode').text, 'light');

  nativeEvent(host.__kuito, 'toggle.press');
  await settle();

  assert.equal(props(views, 'mode').text, 'dark');
});

test('a provider that starts or stops providing reaches readers that would keep their tree', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, VStack, inherit, inherited, provide, signal } from 'kuito';

    const Accent = inherited('gray');
    const Other = inherited('none');

    function Label() {
      const accent = inherit(Accent);

      return <Text id="accent">{accent.value}</Text>;
    }

    function Theme(props: { accent: string | null }) {
      if (props.accent) provide(Accent, props.accent);
      else provide(Other, 'other');

      return <Label />;
    }

    export default function App() {
      const on = signal(false);

      return [
        <VStack>{on.value ? <Theme accent="gold" /> : <Theme accent={null} />}</VStack>,
        <Pressable id="toggle" label="Toggle" onPress={() => (on.value = !on.value)} />,
      ];
    }
  `);

  assert.equal(props(views, 'accent').text, 'gray');

  nativeEvent(host.__kuito, 'toggle.press');
  await settle();

  assert.equal(props(views, 'accent').text, 'gold');

  nativeEvent(host.__kuito, 'toggle.press');
  await settle();

  assert.equal(props(views, 'accent').text, 'gray');
});

test('a computed provided from props follows them without the provider running again', async () => {
  const { host, views } = await run(`
    import { Pressable, Text, computed, inherit, inherited, provide, signal } from 'kuito';

    const Mode = inherited('light');
    const runs = { theme: 0 };

    function Label() {
      const mode = inherit(Mode);

      return <Text id="mode">{mode.value + ' ' + runs.theme}</Text>;
    }

    function Theme(props: { mode: string }) {
      runs.theme++;
      provide(Mode, computed(() => props.mode));

      return <Label />;
    }

    export default function App() {
      const dark = signal(false);

      return [
        <Theme mode={dark.value ? 'dark' : 'light'} />,
        <Pressable id="toggle" label="Toggle" onPress={() => (dark.value = !dark.value)} />,
      ];
    }
  `);

  assert.equal(props(views, 'mode').text, 'light 1');

  nativeEvent(host.__kuito, 'toggle.press');
  await settle();

  assert.equal(props(views, 'mode').text, 'dark 1');
});

test('a branch re-planned alone and a list row inherit what their place inherits', async () => {
  const { host, views } = await run(`
    import { List, Pressable, Show, Text, inherit, inherited, provide, signal } from 'kuito';

    const Accent = inherited('gray');

    function Swatch(props: { id: string }) {
      const accent = inherit(Accent);

      return <Text id={props.id}>{accent.value}</Text>;
    }

    export default function App() {
      const accent = signal('teal');
      const open = signal(false);

      provide(Accent, accent);

      return [
        <Show when={open}><Swatch id="shown" /></Show>,
        <List id="list" data={['a']} itemKey={(item) => item} renderItem={({ item }) => <Swatch id={'row-' + item} />} />,
        <Pressable id="open" label="Open" onPress={() => (open.value = true)} />,
        <Pressable id="recolor" label="Recolor" onPress={() => (accent.value = 'orange')} />,
      ];
    }
  `);

  nativeEvent(host.__kuito, 'open.press');
  nativeEvent(host.__kuito, `list.bind\u001f${JSON.stringify({ cell: 'list:cell-0', key: 'a' })}`);
  await settle();

  assert.equal(props(views, 'shown').text, 'teal');
  assert.equal(props(views, 'row-a').text, 'teal');

  nativeEvent(host.__kuito, 'recolor.press');
  await settle();

  assert.equal(props(views, 'shown').text, 'orange');
  assert.equal(props(views, 'row-a').text, 'orange');
});

test('provide() and inherit() belong to a component setting up', async () => {
  await assert.rejects(
    run(`
      import { Text, inherited, provide } from 'kuito';

      const Accent = inherited('gray');

      provide(Accent, 'teal');

      export default function App() {
        return <Text>App</Text>;
      }
    `),
    /provide\(\) must run during component initialization/,
  );

  await assert.rejects(
    run(`
      import { Text, inherit, inherited } from 'kuito';

      const Accent = inherited('gray');
      const accent = inherit(Accent);

      export default function App() {
        return <Text>{accent.value}</Text>;
      }
    `),
    /inherit\(\) must run during component initialization/,
  );
});

test('Live Patches keep readers inheriting from the nearest provider, kept trees or not', async () => {
  mkdirSync(scratch, { recursive: true });

  const dir = mkdtempSync(join(scratch, 'inherited-'));
  const views = new Map<string, { kind: string; props: Props }>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );
  const badge = (label: string) => `
    import { Text, inherit } from 'kuito';
    import { Accent } from './accent';

    export function Badge() {
      const accent = inherit(Accent);

      return <Text id="badge">{'${label} ' + accent.value}</Text>;
    }
  `;
  // Between the provider and the reader, in a file of its own.
  const middle = (provides: string) => `
    import { VStack, provide } from 'kuito';
    import { Accent } from './accent';
    import { Badge } from './badge';

    export function Middle() {
      ${provides}

      return <VStack><Badge /></VStack>;
    }
  `;
  const compileApp = async () =>
    (await createSourceCompiler({ platform: 'ios', outputDir: dir })(join(dir, 'app.tsx'))).code;

  try {
    writeFileSync(
      join(dir, 'accent.ts'),
      `import { inherited } from 'kuito';\n\nexport const Accent = inherited('gray');\n`,
    );

    writeFileSync(
      join(dir, 'app.tsx'),
      `
        import { Pressable, provide, signal } from 'kuito';
        import { Accent } from './accent';
        import { Middle } from './middle';

        export default function App() {
          const accent = signal('teal');

          provide(Accent, accent);

          return [<Middle />, <Pressable id="recolor" label="Recolor" onPress={() => (accent.value = 'orange')} />];
        }
      `,
    );

    writeFileSync(join(dir, 'middle.tsx'), middle(''));
    writeFileSync(join(dir, 'badge.tsx'), badge('Accent'));
    runInNewContext(await compileApp(), host);

    assert.equal(props(views, 'badge').text, 'Accent teal');

    writeFileSync(join(dir, 'badge.tsx'), badge('Color'));
    runInNewContext(await compileApp(), host);

    assert.equal(props(views, 'badge').text, 'Color teal');

    nativeEvent(host.__kuito, 'recolor.press');
    await settle();

    assert.equal(props(views, 'badge').text, 'Color orange');

    writeFileSync(join(dir, 'middle.tsx'), middle(`provide(Accent, 'inner');`));
    runInNewContext(await compileApp(), host);

    assert.equal(props(views, 'badge').text, 'Color inner', 'a provider added above a kept reader');

    writeFileSync(join(dir, 'middle.tsx'), middle(''));
    runInNewContext(await compileApp(), host);

    assert.equal(props(views, 'badge').text, 'Color orange', 'and removed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
