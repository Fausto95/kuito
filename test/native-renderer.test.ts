import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type HostView, type KuitoJSX } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

function session() {
  const views = new Map<string, HostView & { token: object }>();
  const calls: unknown[][] = [];
  const context = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        assert.equal(views.has(id), false, `duplicate view ${id}`);
        if (parent) assert(views.has(parent), 'parent must exist before child');
        views.set(id, { token: {}, kind, parent, props: {} });
        calls.push(['create', id, kind]);
      },
      setProp(id: string, name: string, value: unknown) {
        assert(views.has(id), `view must exist: ${id}`);
        present(views.get(id), id).props[name] = value;
        calls.push(['prop', id, name, value]);
      },
      removeView(id: string) {
        assert(views.has(id));
        views.delete(id);
        calls.push(['remove', id]);
      },
    }),
  );

  const { __kuito, __kuitoJSX } = context;
  const jsx: KuitoJSX = (type, props, ...children) => __kuitoJSX(type, props, ...children);

  function render(step = 1, label = 'Count: ', withButton = true) {
    __kuito.patch('counter', (api) => {
      const count = api.state('count', 0);

      api.render(
        jsx(
          'VStack',
          { id: 'root', gap: 8 },
          jsx('Text', { id: 'label', text: () => label + count.value }),
          ...(withButton
            ? [
                jsx('Button', {
                  id: 'tap',
                  text: 'Increment',
                  onPress: () => {
                    count.value += step;
                  },
                }),
              ]
            : []),
        ),
      );
    });
  }

  return { views, calls, context, jsx, render };
}

test('real JSX descriptor creates a keyed host tree, and a signal changes only one native property', () => {
  const s = session();

  s.render();
  assert.deepEqual([...s.views.keys()], ['root', 'label', 'tap']);
  assert.equal(s.views.get('label')?.props.text, 'Count: 0');

  const labelIdentity = present(s.views.get('label'), 'label').token;
  const initialCalls = s.calls.length;

  nativeEvent(s.context.__kuito, 'tap.press');
  assert.equal(s.views.get('label')?.props.text, 'Count: 1');
  assert.deepEqual(s.calls.slice(initialCalls), [['prop', 'label', 'text', 'Count: 1']]);
  assert.strictEqual(present(s.views.get('label'), 'label').token, labelIdentity);
});

test('refresh retains native views and state but changes reactive text, gap and event handler', () => {
  const s = session();

  s.render();
  nativeEvent(s.context.__kuito, 'tap.press');

  const signal = present(s.context.__kuito.state('counter', 'count'), 'count state');
  const identities = new Map([...s.views].map(([id, view]) => [id, view.token]));

  s.calls.length = 0;
  s.render(2, 'Total: ');
  assert.strictEqual(s.context.__kuito.state('counter', 'count'), signal);
  assert.deepEqual(s.calls, [['prop', 'label', 'text', 'Total: 1']]);

  for (const [id, token] of identities)
    assert.strictEqual(present(s.views.get(id), id).token, token);

  assert.equal(signal.listenerCount, 1);
  nativeEvent(s.context.__kuito, 'tap.press');
  assert.equal(signal.value, 3);
  assert.equal(s.views.get('label')?.props.text, 'Total: 3');
});

test('removing a JSX child cleans up its native view and handler', () => {
  const s = session();

  s.render();
  s.calls.length = 0;
  s.render(1, 'Count: ', false);
  assert.equal(s.views.has('tap'), false);
  assert.deepEqual(s.calls, [['remove', 'tap']]);

  const signal = present(s.context.__kuito.state('counter', 'count'), 'count state');
  const count = signal.value;

  nativeEvent(s.context.__kuito, 'tap.press');
  assert.equal(signal.value, count);
});

test('throwing computed prop fails before native mutation and preserves previous handlers', () => {
  const s = session();

  s.render();

  const initial = s.calls.length;

  assert.throws(
    () =>
      s.context.__kuito.patch('counter', (api) => {
        const count = api.state('count', 0);

        api.render(
          s.jsx('Text', {
            id: 'label',
            text: () => {
              void count.value; // subscribe before failing
              throw Error('bad computed');
            },
          }),
        );
      }),
    /bad computed/,
  );

  assert.equal(s.calls.length, initial);
  assert.equal(s.context.__kuito.revision('counter'), 1);
  nativeEvent(s.context.__kuito, 'tap.press');
  assert.equal(s.views.get('label')?.props.text, 'Count: 1');
});

test('rendering a view owned by another module fails without mutation', () => {
  const s = session();

  s.render();

  const oldCalls = s.calls.length;

  assert.throws(
    () =>
      s.context.__kuito.patch('other', (api) => {
        api.render(s.jsx('Text', { id: 'label', text: 'Conflict' }));
      }),
    /View owned by another module/,
  );

  assert.equal(s.calls.length, oldCalls);
});

test('disposing one module removes its native tree and subscribers but retains state', () => {
  const s = session();

  s.render();

  const count = present(s.context.__kuito.state('counter', 'count'), 'count state');

  assert.equal(s.context.__kuito.dispose('counter'), true);
  assert.equal(s.views.size, 0);
  assert.equal(count.listenerCount, 0);
  s.render();
  assert.strictEqual(s.context.__kuito.state('counter', 'count'), count);
});

test('removing an attribute clears it without recreating its native view', () => {
  const s = session();

  s.render();

  const identity = present(s.views.get('root'), 'root').token;

  s.context.__kuito.patch('counter', (api) => {
    api.render(s.jsx('VStack', { id: 'root' }, s.jsx('Text', { id: 'label', text: 'Static' })));
  });

  assert.strictEqual(present(s.views.get('root'), 'root').token, identity);
  assert.equal(s.views.get('root')?.props.gap, null);
  assert.equal(s.views.has('tap'), false);
});
