import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import {
  flushed,
  installKernel,
  type HostView,
  type Ref,
  type Signal,
  type KuitoEvent,
  type KuitoJSX,
  type KuitoKernel,
} from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

type Build<R> = (v: KuitoKernel, h: KuitoJSX) => R;

function make() {
  const nodes = new Map<string, HostView>(),
    commands: [string, string][] = [];
  const vm = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        nodes.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        assert.ok(nodes.has(id));
        present(nodes.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        nodes.delete(id);
      },
      command(id: string, op: string) {
        commands.push([id, op]);
      },
    }),
  );

  function patch<R extends { node: unknown }>(build: Build<R>): R {
    let result: R | undefined;

    vm.__kuito.patch('app', (api) => {
      function App() {
        result = build(vm.__kuito, vm.__kuitoJSX);
        return result.node;
      }

      api.render(vm.__kuitoJSX(App, {}));
    });

    return present(result, 'built component');
  }

  return { vm, nodes, commands, patch };
}

test('onMount belongs to the instance and survives a compatible refresh', () => {
  const x = make(),
    calls: string[] = [];
  const component: Build<{ node: unknown }> = (v, h) => {
    v.useLifecycle('mount', () => {
      calls.push(x.nodes.has('root') ? 'mounted' : 'too early');
      return () => calls.push('cleanup');
    });

    return { node: h('VStack', { id: 'root' }) };
  };

  x.patch(component);
  x.patch(component);
  x.vm.__kuito.dispose('app');
  assert.deepEqual(calls, ['mounted', 'cleanup']);
});

test('watch skips initial value, effect dynamically retracks dependencies', async () => {
  const x = make(),
    calls: string[] = [];
  let first!: Signal<number>, second!: Signal<number>, choose!: Signal<boolean>;

  x.patch((v: KuitoKernel, h: KuitoJSX) => {
    first = v.useState(0);
    second = v.useState(10);
    choose = v.useState(true);

    v.useLifecycle(
      'watch',
      () => first.value,
      (n, p) => calls.push('watch:' + p + ':' + n),
    );

    v.useLifecycle('effect', () => {
      calls.push('effect:' + (choose.value ? first.value : second.value));
    });

    return { node: h('VStack', { id: 'root' }) };
  });

  assert.deepEqual(calls, ['effect:0']);
  first.value = 1;
  await flushed();
  assert.deepEqual(calls, ['effect:0', 'watch:0:1', 'effect:1']);
  choose.value = false;
  await flushed();

  const before = calls.length;

  first.value = 2;
  await flushed();
  assert.deepEqual(calls.slice(before), ['watch:1:2']);
  second.value = 11;
  await flushed();
  assert.equal(calls.at(-1), 'effect:11');
});

test('a re-run instance’s watch fires for a value that changed since its last run', () => {
  const x = make(),
    calls: string[] = [];
  const watching =
    (id: number): Build<{ node: unknown }> =>
    (v, h) => {
      v.useLifecycle(
        'watch',
        () => id,
        (n, p) => calls.push(p + '->' + n),
      );

      return { node: h('VStack', { id: 'root' }) };
    };

  x.patch(watching(169));
  x.patch(watching(82));
  x.patch(watching(82));
  assert.deepEqual(calls, ['169->82']);
});

test('refs survive compatible updates, events propagate capture target bubble', () => {
  const x = make(),
    calls: string[] = [];
  let refs!: { root: Ref; btn: Ref };

  function component(v: KuitoKernel, h: KuitoJSX) {
    const root = v.useRef(),
      btn = v.useRef();

    refs = { root, btn };

    return {
      node: h(
        'VStack',
        {
          id: 'root',
          ref: root,
          onPressCapture: () => calls.push('capture'),
          onPress: () => calls.push('bubble'),
        },
        h('Button', { id: 'button', ref: btn, onPress: () => calls.push('target') }, 'Go'),
      ),
    };
  }

  x.patch(component);

  const first = present(refs.btn.current, 'button ref');

  assert.strictEqual(first.parent, refs.root.current);
  assert.strictEqual(refs.root.current?.children[0], first);
  first.addEventListener('press', () => calls.push('listener'), { once: true });
  nativeEvent(x.vm.__kuito, 'button.press');
  assert.deepEqual(calls, ['capture', 'target', 'listener', 'bubble']);
  calls.length = 0;
  x.patch(component);
  assert.strictEqual(first, refs.btn.current);
  nativeEvent(x.vm.__kuito, 'button.press');
  assert.deepEqual(calls, ['capture', 'target', 'bubble']);
  first.focus();
  first.setProperty('text', 'Now');
  assert.deepEqual(x.commands, [['button', 'focus']]);
  assert.equal(x.nodes.get('button')?.props.text, 'Now');
});

test('custom event cancellation, stopPropagation and once listener', () => {
  const x = make(),
    calls: string[] = [];
  let parent!: Ref, child!: Ref;

  x.patch((v: KuitoKernel, h: KuitoJSX) => {
    parent = v.useRef();
    child = v.useRef();

    return {
      node: h(
        'VStack',
        { id: 'root', ref: parent },
        h('Button', { id: 'button', ref: child }, 'Tap'),
      ),
    };
  });

  present(parent.current, 'parent ref').addEventListener('select', () => calls.push('parent'));

  present(child.current, 'child ref').addEventListener(
    'select',
    (e: KuitoEvent) => {
      calls.push('child');
      e.preventDefault();
      e.stopPropagation();
    },
    { once: true },
  );

  let event = { type: 'select', bubbles: true, cancelable: true };

  assert.equal(present(child.current, 'child ref').dispatchEvent(event), false);
  assert.deepEqual(calls, ['child']);
  calls.length = 0;
  event = { type: 'select', bubbles: true, cancelable: true };
  assert.equal(present(child.current, 'child ref').dispatchEvent(event), true);
  assert.deepEqual(calls, ['parent']);
});
