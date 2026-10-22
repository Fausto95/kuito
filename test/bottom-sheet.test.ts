import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { flushed, installKernel, type Props } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

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

test('Sheet is a native container presenting its children', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('player', (api) =>
    api.render(
      jsx(
        'VStack',
        { id: 'screen' },
        jsx(
          'Sheet',
          {
            id: 'queue',
            open: true,
            snapPoints: ['content', '50%', 640],
            grabber: true,
            dismissible: true,
            borderRadius: 28,
            padding: 20,
          },
          jsx('Text', { id: 'title', text: 'Up next' }),
        ),
      ),
    ),
  );

  const sheet = present(views.get('queue'), 'queue');

  assert.equal(sheet.kind, 'Sheet');
  assert.equal(sheet.props.open, true);
  assert.deepEqual(sheet.props.snapPoints, ['content', '50%', 640]);
  // The sheet's corners, not its content's layer: a separate native prop.
  assert.equal(sheet.props.sheetCornerRadius, 28);
  assert.equal(present(views.get('title'), 'title').parent, 'queue');
});

test('Sheet reports dismissal and snap changes', () => {
  const { jsx, kuito } = make();
  const seen: string[] = [];

  kuito.patch('player', (api) =>
    api.render(
      jsx('Sheet', {
        id: 'queue',
        open: true,
        onClose: () => seen.push('close'),
        onSnap: (event: { index?: unknown }) => seen.push('snap ' + String(event.index)),
      }),
    ),
  );

  nativeEvent(kuito, 'queue.snap\u001f{"index":1}');
  nativeEvent(kuito, 'queue.close');

  assert.deepEqual(seen, ['snap 1', 'close']);
});

test('a sheet bound to a signal closes it when the user dismisses the sheet', async () => {
  const { jsx, kuito, views } = make();
  let open!: { value: boolean };

  kuito.patch('player', (api) => {
    function Player() {
      open = kuito.useState(true);

      return jsx('Sheet', { id: 'queue', open }, jsx('Text', { id: 'title', text: 'Up next' }));
    }

    api.render(jsx(Player, {}));
  });

  const before = present(views.get('queue'), 'queue').props.open;

  nativeEvent(kuito, 'queue.close');
  await flushed();

  assert.equal(open.value, false);

  assert.equal(
    present(views.get('queue'), 'queue').props.open,
    before,
    'the sheet closed itself: open is not sent back',
  );
});

test('a Sheet moves its sheet motion from its motion events, announced only when given one', () => {
  const { jsx, kuito, views } = make();
  let sheet!: Record<string, { value: unknown }>;

  kuito.patch('player', (api) => {
    function Player() {
      sheet = kuito.useMotionSource('Sheet');

      return jsx('Sheet', { id: 'queue', open: true, snapPoints: ['50%', '100%'], motion: sheet });
    }

    api.render(jsx(Player, {}));
  });

  assert.equal(present(views.get('queue'), 'queue').props.emitsMotion, true);
  assert.deepEqual(Object.keys(sheet), ['height', 'progress']);

  nativeEvent(kuito, 'queue.motion\u001f{"height":420,"progress":0.25}');

  assert.deepEqual([sheet.height.value, sheet.progress.value], [420, 0.25]);
});
