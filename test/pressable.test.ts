import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';
import { PROPS } from '../src/protocol/manifest.ts';

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

test('Pressable is a native container with press feedback props', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('card', (api) =>
    api.render(
      jsx(
        'Pressable',
        {
          id: 'card',
          pressedOpacity: 0.6,
          pressedScale: 0.97,
          haptic: 'light',
          longPressDuration: 400,
        },
        jsx('Text', { id: 'title', text: 'Open' }),
      ),
    ),
  );

  const card = present(views.get('card'), 'card');

  assert.equal(card.kind, 'Pressable');
  assert.equal(present(views.get('title'), 'title').parent, 'card');

  assert.deepEqual(card.props, {
    pressedOpacity: 0.6,
    pressedScale: 0.97,
    haptic: 'light',
    longPressDuration: 400,
  });
});

test('Pressable holds for longPressDuration before a long press', () => {
  assert.deepEqual(PROPS.longPressDuration?.kinds, ['Pressable']);
  assert.equal('delayLongPress' in PROPS, false, 'the retired name is gone, not aliased');
});

test('Pressable reports press-in, press-out, press and long press with the touch location', () => {
  const { jsx, kuito } = make();
  const seen: string[] = [];
  const record = (name: string) => (event: { locationX?: unknown }) =>
    seen.push(name + ':' + String(event.locationX));

  kuito.patch('card', (api) =>
    api.render(
      jsx('Pressable', {
        id: 'card',
        onPressStart: record('in'),
        onPressEnd: record('out'),
        onPress: record('press'),
        onLongPress: record('long'),
      }),
    ),
  );

  const touch = '\u001f{"locationX":12,"locationY":8,"pageX":40,"pageY":90}';

  nativeEvent(kuito, 'card.pressin' + touch);
  nativeEvent(kuito, 'card.longpress' + touch);
  nativeEvent(kuito, 'card.pressout' + touch);
  nativeEvent(kuito, 'card.press' + touch);

  assert.deepEqual(seen, ['in:12', 'long:12', 'out:12', 'press:12']);
});

test('the innermost Pressable handles a press, as in React Native', () => {
  const { jsx, kuito } = make();
  const pressed: string[] = [];

  kuito.patch('list', (api) =>
    api.render(
      jsx(
        'Pressable',
        { id: 'row', onPress: () => pressed.push('row') },
        jsx('Pressable', { id: 'star', onPress: () => pressed.push('star') }),
      ),
    ),
  );

  nativeEvent(kuito, 'star.press');
  nativeEvent(kuito, 'row.press');

  assert.deepEqual(pressed, ['star', 'row']);
});

test('RN `disabled` reaches the native Pressable', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('card', (api) =>
    api.render(jsx('Pressable', { id: 'card', disabled: true, onPress: () => undefined })),
  );

  assert.equal(present(views.get('card'), 'card').props.disabled, true);
});
