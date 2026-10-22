import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type HostView } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

// Installed by the kernel only when the host provides timers.
interface HostScheduling {
  setTimeout(fn: () => void, delay: number): number;
  clearTimeout(id: number): void;
}

function assertScheduling<H extends object>(host: H): asserts host is H & HostScheduling {
  if (!('setTimeout' in host)) throw new Error('The kernel did not install host timers');
}

function create() {
  const timers = new Map<number, { ms: number; fn: () => void }>(),
    views = new Map<string, HostView>();
  const context = installKernel(
    hosting({
      __kuitoHostSetTimer(id: number, ms: number, fn: () => void) {
        timers.set(id, { ms, fn });
      },
      __kuitoHostClearTimer(id: number) {
        timers.delete(id);
      },
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, key: string, value: unknown) {
        present(views.get(id), id).props[key] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  assertScheduling(context);

  return { context, timers, views };
}

test('native setTimeout schedules and clearTimeout cancels', () => {
  const { context, timers } = create();
  let ticks = 0;
  const a = context.setTimeout(() => ticks++, 250);

  assert.equal(timers.get(a)?.ms, 250);
  present(timers.get(a), 'timer').fn();
  assert.equal(ticks, 1);

  const b = context.setTimeout(() => ticks++, 500);

  context.clearTimeout(b);
  assert.equal(timers.has(b), false);
});

test('native change event updates a fine-grained text binding', () => {
  const { context, views } = create(),
    jsx = context.__kuitoJSX;

  context.__kuito.patch('switch-demo', (api) => {
    function Demo() {
      const enabled = context.__kuito.useState(false);

      return jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'label', text: () => (enabled.value ? 'On' : 'Off') }),
        jsx('Toggle', {
          id: 'toggle',
          value: () => enabled.value,
          onChange: () => {
            enabled.value = !enabled.value;
          },
        }),
      );
    }

    api.render(jsx(Demo, {}));
  });

  assert.equal(views.get('label')?.props.text, 'Off');
  nativeEvent(context.__kuito, 'toggle.change');
  assert.equal(views.get('label')?.props.text, 'On');
  assert.equal(views.get('toggle')?.props.value, true);
});
