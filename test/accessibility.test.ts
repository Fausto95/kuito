import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import {
  flushed,
  installKernel,
  type Props,
  type Ref,
  type KuitoEvent,
} from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

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
  const props = (id: string) => present(views.get(id), id).props;

  return { views, props, commands, jsx: host.__kuitoJSX, kuito: host.__kuito };
}

test('accessibility props cross to the native view under their own names', () => {
  const { jsx, kuito, props } = make();

  kuito.patch('player', (api) =>
    api.render(
      jsx('Pressable', {
        id: 'play',
        accessible: true,
        label: 'Play',
        hint: 'Starts the episode',
        live: 'polite',
        'aria-hidden': false,
        'aria-checked': true,
        'aria-valuenow': 4,
        actions: [{ name: 'activate' }, { name: 'skip', label: 'Skip intro' }],
      }),
    ),
  );

  assert.deepEqual(props('play'), {
    accessible: true,
    label: 'Play',
    hint: 'Starts the episode',
    live: 'polite',
    'aria-hidden': false,
    'aria-checked': true,
    'aria-valuenow': 4,
    actions: [{ name: 'activate' }, { name: 'skip', label: 'Skip intro' }],
  });
});

test("role takes ARIA's names, sent as the platform role each one means", () => {
  const { jsx, kuito, props } = make();

  kuito.patch('page', (api) =>
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'title', role: 'heading', text: 'Reel' }),
        jsx('Image', { id: 'poster', role: 'img', label: 'Poster' }),
        jsx('Box', { id: 'seek', role: 'slider', 'aria-valuenow': 3 }),
      ),
    ),
  );

  assert.deepEqual(props('title'), { role: 'header', text: 'Reel' });
  assert.deepEqual(props('poster'), { role: 'image', label: 'Poster' });
  assert.deepEqual(props('seek'), { role: 'adjustable', 'aria-valuenow': 3 });
});

test('a reactive role is mapped on every update', async () => {
  const { jsx, kuito, props } = make();
  let heading!: { value: boolean };

  kuito.patch('page', (api) => {
    function Title() {
      heading = kuito.useState(true);

      return jsx('Text', { id: 'title', role: () => (heading.value ? 'heading' : 'none') });
    }

    api.render(jsx(Title, {}));
  });

  assert.equal(props('title').role, 'header');

  heading.value = false;
  await flushed();

  assert.equal(props('title').role, 'none');
});

test('an unsupported role fails with the supported ones named', () => {
  const { jsx, kuito } = make();

  assert.throws(
    () => kuito.patch('bad', (api) => api.render(jsx('Pressable', { id: 'x', role: 'treegrid' }))),
    /Unsupported role "treegrid".*heading/,
  );
});

test('onAction receives the action name', () => {
  const { jsx, kuito } = make();
  const names: unknown[] = [];

  kuito.patch('player', (api) =>
    api.render(
      jsx('Box', {
        id: 'volume',
        role: 'slider',
        actions: [{ name: 'increment' }, { name: 'decrement' }],
        onAction: (event: KuitoEvent) => names.push(event.actionName),
      }),
    ),
  );

  nativeEvent(kuito, 'volume.accessibilityaction\u001f{"actionName":"increment"}');

  assert.deepEqual(names, ['increment']);
});

test('announcements and accessibility focus are native commands', () => {
  const { jsx, kuito, commands } = make();
  let title!: Ref;

  kuito.patch('page', (api) => {
    function Page() {
      title = kuito.useRef();

      return jsx('Text', { id: 'title', ref: title, text: 'Results' });
    }

    api.render(jsx(Page, {}));
  });

  kuito.accessibility.announce('12 shows found');
  kuito.accessibility.announce('Saved', { queue: true });
  kuito.accessibility.focus(present(title.current, 'title'));

  assert.deepEqual(commands, [
    ['', 'accessibility.announce', '{"message":"12 shows found","queue":false}'],
    ['', 'accessibility.announce', '{"message":"Saved","queue":true}'],
    ['title', 'accessibility.focus', ''],
  ]);
});

test('screen reader and reduce motion status is asked for once, then cached', () => {
  const { kuito, commands } = make();

  assert.equal(kuito.accessibility.status(), null);
  assert.equal(kuito.accessibility.status(), null);
  assert.deepEqual(commands, [['', 'accessibility.status', '']]);

  nativeEvent(
    kuito,
    '__kuito:accessibility.status\u001f{"screenReaderEnabled":true,"reduceMotionEnabled":false}',
  );

  assert.deepEqual(
    { ...kuito.accessibility.status() },
    {
      screenReaderEnabled: true,
      reduceMotionEnabled: false,
    },
  );

  assert.equal(commands.length, 1);
});

test('change listeners hear the first answer, then only real changes', () => {
  const { kuito, commands } = make();
  const changes: [string, boolean][] = [];
  const status = (screenReader: boolean, reduceMotion: boolean) =>
    nativeEvent(
      kuito,
      '__kuito:accessibility.status\u001f' +
        JSON.stringify({ screenReaderEnabled: screenReader, reduceMotionEnabled: reduceMotion }),
    );

  const subscription = kuito.accessibility.addEventListener('screenReader', (enabled) =>
    changes.push(['screenReader', enabled]),
  );

  kuito.accessibility.addEventListener('reduceMotion', (enabled) =>
    changes.push(['reduceMotion', enabled]),
  );

  assert.deepEqual(commands, [['', 'accessibility.status', '']]);

  status(false, false);
  status(true, false);
  status(true, true);
  status(true, true);
  subscription.remove();
  status(false, true);

  assert.deepEqual(changes, [
    ['screenReader', false],
    ['reduceMotion', false],
    ['screenReader', true],
    ['reduceMotion', true],
  ]);

  assert.throws(() => kuito.accessibility.addEventListener('boldTextChanged', () => {}), /bold/);
});
