import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { compileNativeCSS, KuitoStyleError } from '../src/style/compiler.ts';
import { present } from './support/present.ts';
import { installKernel, type HostView } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

function make() {
  const views = new Map<string, HostView>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        assert.ok(!views.has(id));
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, key: string, value: unknown) {
        assert.ok(views.has(id));

        assert.ok(
          value === null || ['number', 'string', 'boolean'].includes(typeof value),
          'no CSS unit objects may cross native host boundary',
        );

        present(views.get(id), id).props[key] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  return { host, views };
}

test('px/rem compile to native numeric values, :root controls rem', () => {
  const css =
    ':root { font-size: 20px; } @tokens { --gap: 1.5rem; }' +
    ' .card { width: 120px; gap: var(--gap); padding: .75rem; }';
  const sheet = compileNativeCSS(css);

  assert.equal(sheet.rootFontSize, 20);
  assert.equal(sheet.classes.card.width, 120);
  assert.equal(sheet.classes.card.rowGap, 30);
  assert.equal(sheet.classes.card.paddingTop, 15);
});

test('em inherits font size for font-size, and uses own size for padding', () => {
  const { host, views } = make();
  const css =
    ':root { font-size: 20px; }' +
    '.parent { font-size: 1.5em; gap: 1em; }' +
    '.child { font-size: 1.25em; padding: 2em; }' +
    '.box { padding: .5em; }';
  const sheet = compileNativeCSS(css);

  host.__kuito.installStyles(sheet.classes, sheet.rootFontSize);

  const jsx = host.__kuitoJSX;
  const render = () =>
    host.__kuito.patch('unit-demo', (api) =>
      api.render(
        jsx(
          'VStack',
          { id: 'parent', class: 'parent' },
          jsx('Box', { id: 'box', class: 'box' }),
          jsx('Text', { id: 'child', class: 'child', text: 'Hello' }),
        ),
      ),
    );

  render();
  assert.equal(views.get('parent')?.props.rowGap, 30);
  assert.equal('fontSize' in present(views.get('parent'), 'parent').props, false);
  assert.equal(views.get('box')?.props.paddingTop, 15);
  assert.equal(views.get('child')?.props.fontSize, 37.5);
  assert.equal(views.get('child')?.props.paddingTop, 75);
  render();
  assert.equal(host.__kuito.revision('unit-demo'), 2);
});

test('class applies its compiled styles', () => {
  const { host, views } = make();
  const sheet = compileNativeCSS('.card { padding: 12px; gap: 4px; }');

  host.__kuito.installStyles(sheet.classes, sheet.rootFontSize);

  host.__kuito.patch('class-demo', (api) =>
    api.render(host.__kuitoJSX('VStack', { id: 'card', class: 'card' })),
  );

  assert.equal(views.get('card')?.props.paddingTop, 12);
  assert.equal(views.get('card')?.props.rowGap, 4);
});

test('className is not a class prop: it applies no class styles', () => {
  const { host, views } = make();
  const sheet = compileNativeCSS('.card { padding: 12px; }');

  host.__kuito.installStyles(sheet.classes, sheet.rootFontSize);

  host.__kuito.patch('class-demo', (api) =>
    api.render(host.__kuitoJSX('VStack', { id: 'card', className: 'card' })),
  );

  assert.equal(views.get('card')?.props.paddingTop, undefined);
});

test('em values update when compatible CSS source is refreshed', () => {
  const { host, views } = make();
  const jsx = host.__kuitoJSX;
  const render = () =>
    host.__kuito.patch('unit-demo', (api) =>
      api.render(
        jsx(
          'VStack',
          { id: 'parent', class: 'parent' },
          jsx('Text', { id: 'child', class: 'child' }),
        ),
      ),
    );

  host.__kuito.installStyles(
    {
      parent: { fontSize: 20 },
      child: {
        fontSize: { __kuitoLength: 'em', factor: 1.2 },
        padding: { __kuitoLength: 'em', factor: 2 },
      },
    },
    16,
  );

  render();
  assert.equal(views.get('child')?.props.padding, 48);

  host.__kuito.installStyles(
    {
      parent: { fontSize: 25 },
      child: {
        fontSize: { __kuitoLength: 'em', factor: 1.2 },
        padding: { __kuitoLength: 'em', factor: 2 },
      },
    },
    16,
  );

  render();
  assert.equal(views.get('child')?.props.padding, 60);
});

test('invalid measurement values and circular tokens produce actionable errors', () => {
  assert.throws(() => compileNativeCSS('.x { width: 10vh; }'), /Use px, rem or em/);
  assert.throws(() => compileNativeCSS('.x { opacity: 1em; }'), /unitless/);

  assert.throws(
    () => compileNativeCSS('@tokens { --a: var(--b); --b: var(--a); } .x { padding: var(--a); }'),
    /Circular CSS token/,
  );

  assert.throws(
    () => compileNativeCSS('.x { padding: 1rem; }', 'x.css', { rootFontSize: 0 }),
    KuitoStyleError,
  );
});

test('time units are separate from CSS lengths', () => {
  const sheet = compileNativeCSS('.cta { transition: opacity .2s linear; opacity: .5; }');

  assert.deepEqual(sheet.classes.cta.transition, {
    opacity: { type: 'timing', duration: 200, easing: [0, 0, 1, 1], delay: 0 },
  });

  assert.equal(sheet.classes.cta.opacity, 0.5);
});
