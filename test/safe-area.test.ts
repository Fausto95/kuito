import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

function make() {
  const views = new Map<string, { kind: string; parent: string; props: Props }>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  return { views, jsx: host.__kuitoJSX, kuito: host.__kuito };
}

test('SafeArea is a native container that pads the chosen edges', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('screen', (api) =>
    api.render(
      jsx(
        'SafeArea',
        { id: 'safe', edges: ['top', 'bottom'], padding: 16 },
        jsx('Text', { id: 'title', text: 'Inbox' }),
      ),
    ),
  );

  const safe = present(views.get('safe'), 'safe');

  assert.equal(safe.kind, 'SafeArea');
  assert.deepEqual(safe.props.edges, ['top', 'bottom']);
  assert.equal(safe.props.padding, 16);
  assert.equal(present(views.get('title'), 'title').parent, 'safe');
});

test('array props cross the native boundary as plain data, nested data included', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('chart', (api) =>
    api.render(
      jsx('SafeArea', {
        id: 'safe',
        edges: ['top'],
        stops: [
          { at: 0, color: '#000' },
          { at: 1, color: '#fff' },
        ],
        matrix: [
          [1, 0],
          [0, 1],
        ],
      }),
    ),
  );

  const props = present(views.get('safe'), 'safe').props;

  assert.deepEqual(props.stops, [
    { at: 0, color: '#000' },
    { at: 1, color: '#fff' },
  ]);

  assert.deepEqual(props.matrix, [
    [1, 0],
    [0, 1],
  ]);
});

test('values that cannot cross as JSON are still rejected inside arrays', () => {
  const { jsx, kuito } = make();

  assert.throws(
    () => kuito.patch('bad', (api) => api.render(jsx('SafeArea', { edges: [() => 'top'] }))),
    /Native prop edges must resolve to a scalar or plain data/,
  );
});
