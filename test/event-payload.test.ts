import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';
import { EVENT_RECORDS, SYSTEM_EVENT_RECORDS } from '../src/runtime/protocol.generated.ts';

function make() {
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

  return { views, jsx: host.__kuitoJSX, kuito: host.__kuito };
}

test("a text field's onChange receives the text", () => {
  const { jsx, kuito } = make();
  const texts: unknown[] = [];

  kuito.patch('form', (api) =>
    api.render(jsx('TextField', { id: 'name', onChange: (text: string) => texts.push(text) })),
  );

  nativeEvent(kuito, 'name.change\u001f{"text":"Ada"}');

  assert.deepEqual(texts, ['Ada']);
});

test("a toggle's onChange receives whether it is on", () => {
  const { jsx, kuito } = make();
  const values: unknown[] = [];

  kuito.patch('toggle', (api) =>
    api.render(jsx('Toggle', { id: 'wifi', onChange: (checked: boolean) => values.push(checked) })),
  );

  nativeEvent(kuito, 'wifi.change\u001f{"value":true}');
  nativeEvent(kuito, 'wifi.change\u001f{"value":false}');

  assert.deepEqual(values, [true, false]);
});

test('a malformed JSON payload is a clear error and calls no handler', () => {
  const { jsx, kuito } = make();
  let called = false;

  kuito.patch('bad', (api) =>
    api.render(jsx('TextField', { id: 'field', onChange: () => (called = true) })),
  );

  assert.throws(
    () => kuito.dispatch(handleOf(kuito, 'field'), 'change', '{nope'),
    /Invalid event payload for field.change/,
  );

  assert.equal(called, false);
});

test('a typed event is read out of the kernel’s record, with no JSON parsed', () => {
  const { jsx, kuito } = make();
  const seen: unknown[] = [];

  kuito.patch('feed', (api) =>
    api.render(jsx('Scroll', { id: 'feed', onScroll: (event: Props) => seen.push(event.y) })),
  );

  const parses = kuito.stats().total.jsonParses;

  // ScrollPayload's numbers, in the manifest's order: x, y, then the sizes.
  kuito.eventNumbers.set([0, 120, 400, 2000, 400, 800]);
  kuito.dispatchRecord(handleOf(kuito, 'feed'), 'scroll', EVENT_RECORDS.scroll.Scroll);

  assert.deepEqual(seen, [120]);
  assert.equal(kuito.stats().total.jsonParses, parses);
});

test('a typed event’s strings arrive beside its record', () => {
  const { jsx, kuito } = make();
  const texts: unknown[] = [];

  kuito.patch('form', (api) =>
    api.render(jsx('TextField', { id: 'name', onChange: (text: string) => texts.push(text) })),
  );

  kuito.dispatchRecord(handleOf(kuito, 'name'), 'change', EVENT_RECORDS.change.TextField, ['Ada']);

  assert.deepEqual(texts, ['Ada']);
});

test('a record in a layout the view’s kind does not send the event in is refused', () => {
  const { jsx, kuito } = make();
  let called = false;

  kuito.patch('form', (api) =>
    api.render(jsx('TextField', { id: 'name', onChange: () => (called = true) })),
  );

  assert.throws(
    () => kuito.dispatchRecord(handleOf(kuito, 'name'), 'change', EVENT_RECORDS.press.Pressable),
    /name\.change arrived in layout \d+; TextField sends it in \d+/,
  );

  assert.equal(called, false);
});

test('the app’s typed events arrive by target', () => {
  const { kuito } = make();
  const frames: unknown[] = [];

  kuito.keyboard.addListener('didShow', (event) => frames.push((event.frame as Props).height));

  // KeyboardFramePayload: screenX, screenY, width, height, duration; then easing.
  kuito.eventNumbers.set([0, 500, 400, 300, 250]);

  kuito.dispatchRecord(0, 'keyboard.didshow', SYSTEM_EVENT_RECORDS['keyboard.didshow'], [
    'keyboard',
  ]);

  assert.deepEqual(frames, [300]);
});

test('TextInput-style `value` is the native text prop', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('value', (api) => api.render(jsx('TextField', { id: 'field', value: 'hello' })));

  assert.equal(views.get('field')?.props.text, 'hello');
  assert.equal('value' in present(views.get('field'), 'field').props, false);
});

test('a live view ignores native events nobody listens to, as in React Native', () => {
  const { jsx, kuito } = make();

  kuito.patch('quiet', (api) => api.render(jsx('TextField', { id: 'field' })));

  assert.doesNotThrow(() => nativeEvent(kuito, 'field.focus'));
  assert.doesNotThrow(() => nativeEvent(kuito, 'field.change\u001f{"text":"a"}'));
  assert.throws(() => kuito.dispatch(9999, 'focus'), /Unknown view 9999 for its focus event/);
});

test('an event from a view a patch removed is dropped, not dispatched', () => {
  const { jsx, kuito } = make();
  const blurs: string[] = [];
  const rows = (ids: string[]) => (api: { render: (tree: unknown) => void }) =>
    api.render(
      jsx('VStack', {}, ...ids.map((id) => jsx('TextField', { id, onBlur: () => blurs.push(id) }))),
    );

  kuito.patch('list', rows(['input-0', 'input-1']));
  kuito.patch('list', rows([]));

  // The focused field resigns as it leaves the window, after the kernel removed it.
  assert.doesNotThrow(() => nativeEvent(kuito, 'input-0.blur'));
  assert.doesNotThrow(() => nativeEvent(kuito, 'input-1.change\u001f{"text":"a"}'));
  assert.deepEqual(blurs, []);
  assert.throws(() => kuito.dispatch(9999, 'blur'), /Unknown view 9999/);
});
