import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { flushed, installKernel, type Props, type Ref } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';
import { PROP_KEYS } from '../src/runtime/protocol.generated.ts';

function make() {
  const views = new Map<string, { kind: string; parent: string; props: Props }>();
  const commands: [string, string, string][] = [];
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
      command(id: string, name: string, argument: string) {
        commands.push([id, name, argument]);
      },
    }),
  );

  return { views, commands, jsx: host.__kuitoJSX, kuito: host.__kuito };
}

const shown = JSON.stringify({
  screenX: 0,
  screenY: 508,
  width: 390,
  height: 336,
  duration: 250,
  easing: 'keyboard',
});

const hidden = JSON.stringify({
  screenX: 0,
  screenY: 844,
  width: 390,
  height: 0,
  duration: 250,
  easing: 'keyboard',
});

test('keyboard.dismiss is a native command, ordered with view mutations', () => {
  const { kuito, commands } = make();

  kuito.keyboard.dismiss();

  assert.deepEqual(commands, [['', 'keyboard.dismiss', '']]);
});

test('ref.focus() and blur() send commands to the input', () => {
  const { jsx, kuito, commands } = make();
  let field!: Ref;

  kuito.patch('form', (api) => {
    function Form() {
      field = kuito.useRef();

      return jsx('TextField', { id: 'email', ref: field });
    }

    api.render(jsx(Form, {}));
  });

  present(field.current, 'field').focus();
  present(field.current, 'field').blur();

  assert.deepEqual(commands, [
    ['email', 'focus', ''],
    ['email', 'blur', ''],
  ]);
});

test('keyboard listeners receive the frame the keyboard ends at', () => {
  const { kuito } = make();
  const seen: Props[] = [];
  const subscription = kuito.keyboard.addListener('willShow', (event) => seen.push(event));

  nativeEvent(kuito, '__kuito:keyboard.willshow\u001f' + shown);

  assert.equal(seen.length, 1);

  // Copied out of the kernel's realm for a structural comparison.
  assert.deepEqual(JSON.parse(JSON.stringify(seen[0].frame)), {
    screenX: 0,
    screenY: 508,
    width: 390,
    height: 336,
  });

  assert.equal(seen[0].duration, 250);
  assert.equal(seen[0].easing, 'keyboard');
  assert.equal('isEventFromThisApp' in seen[0], false, 'every event is this app’s');

  subscription.remove();
  nativeEvent(kuito, '__kuito:keyboard.willshow\u001f' + shown);

  assert.equal(seen.length, 1);
});

test('each keyboard event name listens to its native event', () => {
  const { kuito } = make();
  const seen: string[] = [];
  const names = {
    willShow: 'willshow',
    didShow: 'didshow',
    willHide: 'willhide',
    didHide: 'didhide',
    willChangeFrame: 'willchangeframe',
    didChangeFrame: 'didchangeframe',
  };

  Object.entries(names).forEach(([name, type]) => {
    kuito.keyboard.addListener(name, () => seen.push(name));
    nativeEvent(kuito, '__kuito:keyboard.' + type + '\u001f' + shown);
  });

  assert.deepEqual(seen, Object.keys(names));

  assert.throws(() => kuito.keyboard.addListener('keyboardWillShow', () => {}), /keyboardWillShow/);
});

test('the frame follows the last shown or hidden keyboard, one object per change', () => {
  const { kuito } = make();

  assert.equal(kuito.keyboard.frame(), null);

  nativeEvent(kuito, '__kuito:keyboard.didshow\u001f' + shown);

  assert.equal(kuito.keyboard.frame(), kuito.keyboard.frame());

  assert.deepEqual(
    { ...kuito.keyboard.frame() },
    {
      screenX: 0,
      screenY: 508,
      width: 390,
      height: 336,
    },
  );

  nativeEvent(kuito, '__kuito:keyboard.didhide\u001f' + hidden);

  assert.equal(kuito.keyboard.frame(), null);
});

test('keyboard.height asks the platform for its moves once read, and follows them', () => {
  const { kuito, commands } = make();
  const height = kuito.keyboard.heightMotion();

  assert.deepEqual(commands, [], 'nothing asked until the app reads it');
  assert.equal(height.value, 0, 'hidden');
  assert.deepEqual(commands, [['', 'keyboard.motion', 'on']]);

  nativeEvent(kuito, '__kuito:keyboard.move\u001f{"height":120}');
  assert.equal(height.value, 120, 'with no UI thread, this thread moves it');

  nativeEvent(kuito, '__kuito:keyboard.move\u001f{"height":336}');
  assert.equal(height.value, 336);
  assert.equal(kuito.keyboard.heightMotion(), height, 'one value for the app');
  assert.deepEqual(commands, [['', 'keyboard.motion', 'on']], 'asked once');

  assert.throws(() => {
    height.value = 3;
  }, /keyboard.height is the platform's/);
});

test('system events nobody listens to are dropped; unknown system targets are not', () => {
  const { kuito } = make();

  assert.equal(nativeEvent(kuito, '__kuito:keyboard.didchangeframe\u001f' + shown), undefined);

  assert.throws(() => kuito.dispatch(0, 'clipboard.change'), /Unknown app event: clipboard.change/);
});

test('input, scroll and container keyboard props reach the native views', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('form', (api) =>
    api.render(
      jsx(
        'VStack',
        { id: 'screen', keyboard: { avoid: 'padding' } },
        jsx(
          'Scroll',
          { id: 'list', keyboard: { dismiss: 'on-drag', persistTaps: 'handled', inset: false } },
          jsx('TextField', {
            id: 'name',
            enterKeyHint: 'next',
            submitBehavior: 'submit',
            autoFocus: true,
          }),
        ),
      ),
    ),
  );

  assert.equal(present(views.get('screen'), 'screen').props.keyboardAvoidance, 'padding');

  assert.deepEqual(present(views.get('list'), 'list').props, {
    keyboardDismissMode: 'on-drag',
    keyboardShouldPersistTaps: 'handled',
    automaticallyAdjustKeyboardInsets: false,
  });

  assert.deepEqual(present(views.get('name'), 'name').props, {
    enterKeyHint: 'next',
    submitBehavior: 'submit',
    autoFocus: true,
  });
});

test('a reactive container keyboard object sets only the fields that kind takes', () => {
  const { jsx, kuito, views } = make();

  // JSX compiles the object to a function, so the group is reactive: every
  // field is planned, and one the object drops is cleared.
  kuito.patch('form', (api) =>
    api.render(jsx('VStack', { id: 'screen', keyboard: () => ({ avoid: 'position' }) })),
  );

  assert.deepEqual(present(views.get('screen'), 'screen').props, {
    keyboardAvoidance: 'position',
  });
});

test('a reactive scroll keyboard object clears the fields that kind takes and it drops', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('form', (api) =>
    api.render(jsx('Scroll', { id: 'list', keyboard: () => ({ dismiss: 'on-drag' }) })),
  );

  assert.deepEqual(present(views.get('list'), 'list').props, {
    keyboardDismissMode: 'on-drag',
    keyboardShouldPersistTaps: null,
    automaticallyAdjustKeyboardInsets: null,
    keyboardAvoidance: null,
  });
});

test('a field with lines is a multi-line native field, and dropping lines remounts it', async () => {
  const { jsx, kuito, views } = make();
  let lines!: { value: number | undefined };
  const typed: string[] = [];

  kuito.patch('notes', (api) => {
    lines = api.state<number | undefined>('lines', 3);

    api.render(
      jsx('TextField', {
        id: 'notes',
        lines: () => lines.value,
        value: 'Draft',
        placeholder: 'Notes',
        submitBehavior: 'newline',
        onChange: (text: string) => typed.push(text),
      }),
    );
  });

  const notes = present(views.get('notes'), 'notes');

  assert.equal(notes.kind, 'MultilineTextField');

  assert.deepEqual(notes.props, {
    lines: 3,
    text: 'Draft',
    placeholder: 'Notes',
    submitBehavior: 'newline',
  });

  nativeEvent(kuito, 'notes.change\u001f{"text":"Draft\\nmore"}');

  assert.deepEqual(typed, ['Draft\nmore']);

  lines.value = undefined;

  // The re-plan runs as a task: poll for it, with a deadline.
  for (
    const deadline = Date.now() + 1000;
    present(views.get('notes'), 'notes').kind !== 'TextField';
  ) {
    assert.ok(Date.now() < deadline, 'the field remounts single-line');
    await new Promise((resolve) => setImmediate(resolve));
  }

  // A binding that reads undefined sends null: the field has no line count.
  assert.equal(present(views.get('notes'), 'notes').props.lines ?? null, null);
});

test("a field's selection is a two-way value with a change event of its own", async () => {
  const { jsx, kuito, views } = make();
  let selection!: { value: { start: number; end: number } };
  const seen: unknown[] = [];

  kuito.patch('editor', (api) => {
    selection = api.state('selection', { start: 0, end: 0 });

    api.render(
      jsx('TextField', {
        id: 'editor',
        value: 'hello',
        selection,
        onSelectionChange: (range: unknown) => seen.push(range),
      }),
    );
  });

  const editor = present(views.get('editor'), 'editor');
  // A JSON prop crosses as its text.
  const shown = () => editor.props.selection;

  assert.deepEqual(shown(), { start: 0, end: 0 });
  assert.equal(editor.props.emitsSelection, true, 'the field sends its selection only when asked');

  nativeEvent(kuito, 'editor.selectionchange\u001f{"start":1,"end":3}');
  await flushed();

  // Copied out of the kernel's realm for a structural comparison.
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [{ start: 1, end: 3 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(selection.value)), { start: 1, end: 3 });
  assert.deepEqual(shown(), { start: 0, end: 0 }, 'not echoed to the field');

  selection.value = { start: 5, end: 5 };
  await flushed();

  assert.deepEqual(shown(), { start: 5, end: 5 });
});

test('a selection the user moved away from is sent again, and an equal echo is not', async () => {
  const sent: unknown[] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(_id: string, name: string, value: unknown) {
        if (name === 'selection') sent.push(value);
      },
      removeView() {},
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;
  let selection!: { value: { start: number; end: number } };

  kuito.patch('editor', (api) => {
    selection = api.state('selection', { start: 0, end: 0 });

    api.render(
      jsx('TextField', {
        id: 'editor',
        value: 'hello',
        selection,
        // An equal copy, not the object the kernel recorded.
        onSelectionChange: (range: { start: number; end: number }) =>
          (selection.value = { ...range }),
      }),
    );
  });

  sent.length = 0;
  nativeEvent(kuito, 'editor.selectionchange\u001f{"start":1,"end":3}');
  await flushed();

  assert.deepEqual(sent, [], 'the copy repeats what the field shows');

  selection.value = { start: 0, end: 0 };
  await flushed();

  assert.deepEqual(sent, [{ start: 0, end: 0 }], 'the field shows 1 to 3, so 0 is news');
});

test('a selection reaches a new field after its text, whatever the JSX order', () => {
  const order: string[] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(_id: string, name: string) {
        order.push(name);
      },
      removeView() {},
    }),
  );

  host.__kuito.patch('editor', (api) =>
    api.render(
      host.__kuitoJSX('TextField', {
        id: 'editor',
        selection: { start: 1, end: 3 },
        value: 'hello',
      }),
    ),
  );

  // Offsets index into the text: text the native field gets later would move them.
  assert.deepEqual(
    order.filter((name) => name === 'text' || name === 'selection'),
    ['text', 'selection'],
  );
});

test("a field's input props are native props that reach the field", () => {
  const { jsx, kuito, views } = make();
  const input = ['type', 'inputMode', 'autoComplete', 'autoCapitalize', 'maxLength', 'spellCheck'];

  assert.deepEqual(
    input.filter((name) => !Object.hasOwn(PROP_KEYS, name)),
    [],
  );

  kuito.patch('form', (api) =>
    api.render(
      jsx('TextField', {
        id: 'code',
        type: 'password',
        inputMode: 'numeric',
        autoComplete: 'one-time-code',
        autoCapitalize: 'none',
        maxLength: 6,
        spellCheck: false,
      }),
    ),
  );

  assert.deepEqual(present(views.get('code'), 'code').props, {
    type: 'password',
    inputMode: 'numeric',
    autoComplete: 'one-time-code',
    autoCapitalize: 'none',
    maxLength: 6,
    spellCheck: false,
  });
});

test('a controlled input is not sent back the text it just reported', async () => {
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        sent.push([id, name, value]);
      },
      removeView() {},
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;
  let query!: { value: string };

  kuito.patch('search', (api) => {
    function Search() {
      query = kuito.useState('');

      return jsx('TextField', {
        id: 'field',
        value: () => query.value,
        onChange: (text: string) => (query.value = text),
      });
    }

    api.render(jsx(Search, {}));
  });

  sent.length = 0;

  // The user typed "gi"; the event for "g" arrives while the field already
  // holds "gi". Echoing "g" back would erase the "i".
  nativeEvent(kuito, 'field.change\u001f{"text":"g"}');
  nativeEvent(kuito, 'field.change\u001f{"text":"gi"}');

  assert.deepEqual(sent, []);

  query.value = 'girls';
  await flushed();

  assert.deepEqual(sent, [['field', 'text', 'girls']]);
});

test('a switch is not sent back the value it just reported', () => {
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        sent.push([id, name, value]);
      },
      removeView() {},
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;

  kuito.patch('settings', (api) => {
    function Settings() {
      const on = kuito.useState(false);

      return jsx('Toggle', {
        id: 'wifi',
        checked: () => on.value,
        onChange: (checked: boolean) => (on.value = checked),
      });
    }

    api.render(jsx(Settings, {}));
  });

  sent.length = 0;
  nativeEvent(kuito, 'wifi.change\u001f{"value":true}');

  assert.deepEqual(sent, []);
});

test('typing into a signal-bound field writes the signal, with no handler and no echo', async () => {
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        sent.push([id, name, value]);
      },
      removeView() {},
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;
  let query!: { value: string };

  kuito.patch('search', (api) => {
    function Search() {
      query = kuito.useState('');

      // `value={query}` compiles to a thunk returning the signal.
      return jsx('TextField', { id: 'field', value: () => query });
    }

    api.render(jsx(Search, {}));
  });

  sent.length = 0;

  nativeEvent(kuito, 'field.change\u001f{"text":"g"}');
  nativeEvent(kuito, 'field.change\u001f{"text":"gi"}');
  await flushed();

  assert.equal(query.value, 'gi');
  assert.deepEqual(sent, [], 'the field already shows what it reported');

  query.value = 'girls';
  await flushed();

  assert.deepEqual(sent, [['field', 'text', 'girls']]);
});

test('a switch bound to a signal writes it; a computed it shows is never written', async () => {
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        sent.push([id, name, value]);
      },
      removeView() {},
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;
  let on!: { value: boolean };

  kuito.patch('settings', (api) => {
    function Settings() {
      on = kuito.useState(false);

      const off = kuito.computed(() => !on.value);

      return jsx(
        'VStack',
        { id: 'root' },
        jsx('Toggle', { id: 'wifi', checked: on }),
        jsx('Toggle', { id: 'airplane', checked: off }),
      );
    }

    api.render(jsx(Settings, {}));
  });

  sent.length = 0;
  nativeEvent(kuito, 'wifi.change\u001f{"value":true}');
  await flushed();

  assert.equal(on.value, true);
  assert.deepEqual(sent, [['airplane', 'checked', false]]);

  nativeEvent(kuito, 'airplane.change\u001f{"value":true}');
  await flushed();

  assert.equal(on.value, true, 'a read-only signal shows the value one way');
});

test('a reactive keyboard object sets every field, clearing the ones it drops', async () => {
  const { jsx, kuito, views } = make();
  let options!: { value: Record<string, string> };

  kuito.patch('form', (api) => {
    function Form() {
      options = kuito.useState<Record<string, string>>({ dismiss: 'on-drag' });

      return jsx('Scroll', { id: 'list', keyboard: () => options.value });
    }

    api.render(jsx(Form, {}));
  });

  assert.equal(present(views.get('list'), 'list').props.keyboardDismissMode, 'on-drag');

  options.value = { persistTaps: 'always' };
  await flushed();

  assert.equal(present(views.get('list'), 'list').props.keyboardDismissMode, null);
  assert.equal(present(views.get('list'), 'list').props.keyboardShouldPersistTaps, 'always');
});

const cardNumber = (text: string) => text.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');

test('a format the UI thread does not run formats on the JS thread: it shows, then reports', async () => {
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        sent.push([id, name, value]);
      },
      removeView() {},
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;
  let card!: { value: string };
  const changes: string[] = [];
  const selections: unknown[] = [];

  kuito.patch('payment', (api) => {
    card = api.state('card', '');

    api.render(
      jsx('TextField', {
        id: 'card',
        value: card,
        format: cardNumber,
        onChange: (text: string) => changes.push(text),
        onSelectionChange: (range: unknown) => selections.push(range),
      }),
    );
  });

  assert.ok(
    sent.some(([, name, value]) => name === 'formats' && value === true),
    'the field asks for its edits',
  );

  sent.length = 0;

  nativeEvent(kuito, 'card.format\u001f{"text":"42424","start":5,"end":5}');
  await flushed();

  // Copied out of the kernel's realm for a structural comparison.
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ['card', 'text', '4242 4'],
    ['card', 'selection', { start: 6, end: 6 }],
  ]);

  assert.equal(card.value, '4242 4');
  assert.deepEqual(changes, ['4242 4']);
  assert.deepEqual(JSON.parse(JSON.stringify(selections)), [{ start: 6, end: 6 }]);

  sent.length = 0;
  card.value = '4242 4';
  await flushed();

  assert.deepEqual(sent, [], 'the field shows the formatted text already');
});

test('a field without format asks for no edits, and format takes a function', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('plain', (api) => api.render(jsx('TextField', { id: 'plain' })));

  assert.equal(present(views.get('plain'), 'plain').props.formats, undefined);

  assert.throws(
    () =>
      kuito.patch('broken', (api) =>
        api.render(jsx('TextField', { id: 'broken', format: 'card' })),
      ),
    /TextField format must be a function from the text typed to the text shown/,
  );
});

test('a format that throws on the JS thread is reported, and the edit is reported as typed', async () => {
  const logs: string[] = [];
  const sent: [string, string, unknown][] = [];
  const host = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        sent.push([id, name, value]);
      },
      removeView() {},
      __kuitoHostLog(level: string, message: string) {
        logs.push(level + ' ' + message);
      },
    }),
  );
  const { __kuito: kuito, __kuitoJSX: jsx } = host;
  const changes: string[] = [];

  kuito.patch('broken', (api) => {
    api.render(
      jsx('TextField', {
        id: 'broken',
        format: (text: { missing: string }) => text.missing.length as never,
        onChange: (text: string) => changes.push(text),
      }),
    );
  });

  sent.length = 0;

  nativeEvent(kuito, 'broken.format\u001f{"text":"a","start":1,"end":1}');
  await flushed();

  assert.deepEqual(changes, ['a']);
  assert.deepEqual(sent, [], 'the field shows the edit already');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^error TextField format/);
});
