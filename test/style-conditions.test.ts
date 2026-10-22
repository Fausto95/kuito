import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { compileNativeCSS } from '../src/style/compiler.ts';
import { fakeModules, linkedNames } from './support/fake-modules.ts';
import { hosting, type HostRecord } from './support/host-wire.ts';
import { present } from './support/present.ts';
import { flushed, installKernel, type HostView } from './support/kuito-host.ts';

// Styles that branch on the system: the kernel picks a class's props by the
// color scheme, the window's width and the motion preference, and a change
// sends only the props it changes, in one commit, with nothing planned again.

/** A built-in member's id, as the compiler numbers it. */
function linkedId(name: string): number {
  const found = [...linkedNames].find(([, each]) => each === name);

  if (!found) throw new Error(`${name} is not a built-in module's member`);

  return found[0];
}

interface Platform {
  scheme: string | null;
  width: number;
}

function make(css: string, platform: Platform = { scheme: 'light', width: 402 }) {
  const native = fakeModules({
    Appearance: {
      functions: {
        colorScheme: { thread: 'js', run: () => platform.scheme },
        fontScale: { thread: 'js', run: () => 1 },
      },
    },
    Window: {
      functions: {
        metrics: {
          thread: 'js',
          run: () => ({
            width: platform.width,
            height: 874,
            insets: { top: 0, left: 0, bottom: 0, right: 0 },
            orientation: 'portrait',
          }),
        },
      },
    },
  });
  const views = new Map<string, HostView>();
  const commits: HostRecord[][] = [];
  const kernel = installKernel(
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
      commit(records) {
        commits.push(records);
      },
      ...native.host,
    }),
  );
  const sheet = compileNativeCSS(css, 'app.css', { platform: 'ios' });

  native.attach(kernel);

  // As src/native/media/ provides them in an app whose styles branch.
  const live = (name: string) => kernel.__kuito.linkLive(linkedId(name), name);

  kernel.__kuito.provideMedia({
    colorScheme: live('Appearance.colorScheme'),
    windowMetrics: live('Window.metrics'),
  });

  kernel.__kuito.installStyles(sheet.classes, sheet.rootFontSize, sheet.conditions);

  const render = (element: () => unknown) =>
    kernel.__kuito.patch('app', (api) => api.render(element()));

  return {
    kernel,
    native,
    views,
    jsx: kernel.__kuitoJSX,
    render,
    props: (id: string) => present(views.get(id), id).props,
    /** The batches committed while `change` ran, and whether any planned a branch again. */
    async during(change: () => void) {
      const from = commits.length;
      const replans = kernel.__kuito.stats().replans;

      change();
      await flushed();

      return {
        commits: commits.slice(from),
        replans: kernel.__kuito.stats().replans - replans,
      };
    },
    scheme(next: string | null) {
      platform.scheme = next;
      native.emit('Appearance', 'colorScheme', next);
    },
    resize(width: number) {
      platform.width = width;

      native.emit('Window', 'metrics', {
        width,
        height: 874,
        insets: { top: 0, left: 0, bottom: 0, right: 0 },
        orientation: width > 874 ? 'landscape' : 'portrait',
      });
    },
    reduceMotion(on: boolean) {
      kernel.__kuito.dispatch(
        0,
        'accessibility.status',
        JSON.stringify({ screenReaderEnabled: false, reduceMotionEnabled: on }),
      );
    },
  };
}

const THEMED = [
  ':root { --surface: white; --ink: #111111; --space: 8px; }',
  '@media (prefers-color-scheme: dark) { :root { --surface: black; } }',
  '.card { background-color: var(--surface); border: 1px solid var(--surface);',
  '  color: var(--ink); padding: var(--space); }',
].join('\n');

const props = (records: HostRecord[]) =>
  records.flatMap((record) => (record.op === 'prop' ? [record.name + '=' + record.value] : []));

test('a token that follows the theme is resolved by the color scheme', async () => {
  const app = make(THEMED);

  app.render(() => app.jsx('Box', { id: 'card', class: 'card' }));

  assert.equal(app.props('card').backgroundColor, '#ffffff');
  assert.equal(app.props('card').borderColor, '#ffffff');
  assert.equal(app.props('card').color, '#111111');
  assert.equal(app.props('card').paddingTop, 8);
  assert.deepEqual(app.native.observed, ['start Appearance.colorScheme']);
});

test('a theme change sends only the token-backed props, in one commit, planning nothing', async () => {
  const app = make(THEMED);

  app.render(() => app.jsx('Box', { id: 'card', class: 'card' }));

  const { commits, replans } = await app.during(() => app.scheme('dark'));

  assert.equal(replans, 0);
  assert.equal(commits.length, 1);
  assert.deepEqual(props(commits[0]).sort(), ['backgroundColor=#000000', 'borderColor=#000000']);

  assert.deepEqual(
    commits[0].filter((record) => record.op !== 'prop'),
    [],
    'no view is created, moved or removed',
  );

  // No preference reads as light, as CSS does.
  await app.during(() => app.scheme(null));
  assert.equal(app.props('card').backgroundColor, '#ffffff');
});

test('a class with no token or condition makes the view follow nothing', async () => {
  const app = make('.plain { opacity: 0.5; }');

  app.render(() => app.jsx('Box', { id: 'plain', class: 'plain' }));

  assert.equal(app.props('plain').opacity, 0.5);
  assert.deepEqual(app.native.observed, []);
  assert.deepEqual(app.native.loads, [], 'no system module is asked');
});

test('a width condition applies when the window crosses it, within one commit', async () => {
  const app = make(
    [
      '.grid { padding: 8px; flex-direction: column; }',
      '@media (min-width: 600px) { .grid { padding: 24px; } }',
      '@media (width-class: expanded) { .grid { flex-direction: row; } }',
    ].join('\n'),
    { scheme: 'light', width: 834 },
  );

  app.render(() => app.jsx('VStack', { id: 'grid', class: 'grid' }));
  assert.equal(app.props('grid').paddingTop, 24);
  assert.equal(app.props('grid').flexDirection, 'column', '834pt is a medium width class');
  assert.equal(app.kernel.__kuito.widthClass().value, 'medium', 'as window.widthClass reads it');

  // A rotation crosses into expanded: one commit, the one prop that differs.
  const rotated = await app.during(() => app.resize(1210));

  assert.equal(rotated.replans, 0);
  assert.equal(rotated.commits.length, 1);
  assert.deepEqual(props(rotated.commits[0]), ['flexDirection=row']);

  // A resize that crosses nothing sends nothing.
  assert.deepEqual((await app.during(() => app.resize(1180))).commits, []);

  await app.during(() => app.resize(402));
  assert.equal(app.props('grid').paddingTop, 8);
  assert.equal(app.props('grid').flexDirection, 'column');
});

test('a prop a condition alone sets goes back to its default when it no longer holds', async () => {
  const app = make('@media (min-width: 600px) { .wide { opacity: 0.5; } }', {
    scheme: 'light',
    width: 834,
  });

  app.render(() => app.jsx('Box', { id: 'box', class: 'wide' }));
  assert.equal(app.props('box').opacity, 0.5);

  await app.during(() => app.resize(402));
  assert.equal(app.props('box').opacity, null);
});

test('props a condition or variant stops setting cross as null, for the unset rules', async () => {
  const app = make(
    [
      '@media (min-width: 600px) { .wide { opacity: 0.5; color: red; border-color: blue;',
      '  text-align: center; line-height: 30px; } }',
      '.tag[data-tone=loud] { background-color: red; font-size: 30px; }',
    ].join('\n'),
    { scheme: 'light', width: 834 },
  );
  const label = (tone: string | null) =>
    app.jsx('Text', { id: 'label', class: ['wide', 'tag', { tone }], text: 'Hi' });

  app.render(() => label('loud'));

  const narrowed = await app.during(() => app.resize(402));

  assert.equal(narrowed.commits.length, 1);

  assert.deepEqual(props(narrowed.commits[0]).sort(), [
    'borderColor=null',
    'color=null',
    'lineHeight=null',
    'opacity=null',
    'textAlign=null',
  ]);

  const quiet = await app.during(() => app.render(() => label(null)));

  assert.deepEqual(props(quiet.commits.flat()).sort(), ['backgroundColor=null', 'fontSize=null']);
});

test('prefers-reduced-motion follows the accessibility setting', async () => {
  const app = make(
    [
      '.parallax { translate-y: 40px; }',
      '@media (prefers-reduced-motion: reduce) { .parallax { translate-y: 0; } }',
    ].join('\n'),
  );

  app.render(() => app.jsx('Box', { id: 'layer', class: 'parallax' }));
  assert.equal(app.props('layer').translateY, 40, 'no answer yet reads as no preference');

  await app.during(() => app.reduceMotion(true));
  assert.equal(app.props('layer').translateY, 0);

  await app.during(() => app.reduceMotion(false));
  assert.equal(app.props('layer').translateY, 40);
});

test('a condition wins over the class it belongs to, and a later class over both', async () => {
  const app = make(
    [
      '.a { opacity: 0.1; }',
      '@media (prefers-color-scheme: dark) { .a { opacity: 0.2; } }',
      '.b { opacity: 0.3; }',
    ].join('\n'),
    { scheme: 'dark', width: 402 },
  );

  app.render(() =>
    app.jsx('VStack', {}, [
      app.jsx('Box', { id: 'one', class: 'a' }),
      app.jsx('Box', { id: 'two', class: 'a b' }),
      app.jsx('Box', { id: 'three', class: 'b a' }),
      app.jsx('Box', { id: 'own', class: 'a', opacity: 0.9 }),
    ]),
  );

  assert.equal(app.props('one').opacity, 0.2);
  assert.equal(app.props('two').opacity, 0.3);
  assert.equal(app.props('three').opacity, 0.2);
  assert.equal(app.props('own').opacity, 0.9, "the view's own prop wins over its classes");

  await app.during(() => app.scheme('light'));
  assert.equal(app.props('three').opacity, 0.1);
  assert.equal(app.props('own').opacity, 0.9);
});

test('an em length under a condition resolves against the view’s font size', async () => {
  const app = make(
    [
      '.label { font-size: 20px; padding: 1em; }',
      '@media (min-width: 600px) { .label { padding: 2em; } }',
    ].join('\n'),
  );

  app.render(() => app.jsx('Text', { id: 'label', class: 'label', text: 'Hi' }));
  assert.equal(app.props('label').paddingTop, 20);

  await app.during(() => app.resize(834));
  assert.equal(app.props('label').paddingTop, 40);
});

test('a variant applies over its class, whichever comes first in the list', async () => {
  const app = make(
    [
      '.card { padding: 8px; opacity: 1; }',
      '@media (prefers-color-scheme: dark) { .card { opacity: 0.9; } }',
      '.card[data-size=large] { padding: 16px; }',
      '.card[data-tone=muted] { opacity: 0.5; }',
      '.badge[data-size=large] { gap: 6px; }',
    ].join('\n'),
    { scheme: 'dark', width: 402 },
  );

  app.render(() =>
    app.jsx('VStack', {}, [
      app.jsx('Box', { id: 'plain', class: ['card', { size: null, tone: false }] }),
      app.jsx('Box', { id: 'large', class: [{ size: 'large', tone: 'muted' }, 'card', 'badge'] }),
    ]),
  );

  assert.equal(app.props('plain').paddingTop, 8);
  assert.equal(app.props('plain').opacity, 0.9);
  assert.equal(app.props('large').paddingTop, 16);
  assert.equal(app.props('large').opacity, 0.5, "a variant wins over its class's conditions");
  assert.equal(app.props('large').rowGap, 6, 'data attributes apply to every class in the list');
});

test('a variant no class in the list has is an error naming what it has', () => {
  const app = make('.card { opacity: 1; }\n.card[data-size=large] { opacity: 0.5; }');

  assert.throws(
    () => app.render(() => app.jsx('Box', { id: 'a', class: ['card', { tone: 'warm' }] })),
    /No class in "card" has a tone variant/,
  );

  assert.throws(
    () => app.render(() => app.jsx('Box', { id: 'b', class: ['card', { size: 'huge' }] })),
    /card has no size variant "huge": it has large/,
  );
});
