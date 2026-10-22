import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { present } from './support/present.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Compiles `source` as an app with the real compiler and runs it in a fresh kernel. */
async function run(source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-props-'));
  const views = new Map<string, { props: Props }>();
  const host = installKernel(
    hosting({
      createView(id: string) {
        views.set(id, { props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  try {
    const entry = join(dir, 'app.tsx');

    writeFileSync(entry, source);

    const output = await createSourceCompiler({ platform: 'ios', outputDir: dir })(entry);

    runInNewContext(output.code, host);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return { host, views };
}

test('a component reads its props as values, as in React', async () => {
  const { views } = await run(`
    import { Text, Pressable } from '${process.cwd()}/src/ui/index.ts';

    function Card(props: { show: { name: string; year: number } }) {
      return <Text id="title">{props.show.name + ' (' + props.show.year + ')'}</Text>;
    }

    export default function App() {
      const show = { name: 'Severance', year: 2022 };

      return <Card show={show} />;
    }
  `);

  assert.equal(present(views.get('title'), 'title').props.text, 'Severance (2022)');
});

test('reading a prop inside JSX stays reactive to the signal behind it', async () => {
  const { host, views } = await run(`
    import { Text, Pressable, signal } from '${process.cwd()}/src/ui/index.ts';

    function Label(props: { count: number }) {
      return <Text id="label">{'Count: ' + props.count}</Text>;
    }

    export default function App() {
      const count = signal(1);

      return [
        <Label count={count.value * 10} />,
        <Pressable id="add" label="Add" onPress={() => count.value++} />,
      ];
    }
  `);

  assert.equal(present(views.get('label'), 'label').props.text, 'Count: 10');

  nativeEvent(host.__kuito, 'add.press');
  await settle();

  assert.equal(present(views.get('label'), 'label').props.text, 'Count: 20');
});
