import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { flushed, installKernel, type Props, type KuitoKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

function session() {
  const nodes = new Map<string, { type: string; props: Props }>();
  const sandbox = installKernel(
    hosting({
      createView(id: string, type: string) {
        nodes.set(id, { type, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        assert.ok(nodes.has(id), 'native view exists');
        present(nodes.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        nodes.delete(id);
      },
    }),
  );

  return { nodes, sandbox };
}

type Session = ReturnType<typeof session>;

function render<R extends { text: unknown }>(s: Session, setup: (kuito: KuitoKernel) => R): R {
  let result: R | undefined;

  s.sandbox.__kuito.patch('app', (api) => {
    function App() {
      result = setup(s.sandbox.__kuito);

      return s.sandbox.__kuitoJSX(
        'VStack',
        { id: 'root' },
        s.sandbox.__kuitoJSX('Text', { id: 'status', text: result.text }),
      );
    }

    api.render(s.sandbox.__kuitoJSX(App, {}));
  });

  return present(result, 'rendered setup');
}

function deferred() {
  return Promise.withResolvers<string>();
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('task is lazy and exposes reactive running/data on completion', async () => {
  const s = session();
  let calls = 0;
  const { work } = render(s, (kuito) => {
    const work = kuito.useTask(async () => {
      calls++;
      return 7;
    });

    return {
      work,
      text: () => {
        const busy = work.running.value,
          value = work.data.value;

        return busy ? 'Loading' : String(value ?? 'Idle');
      },
    };
  });

  assert.equal(calls, 0);
  assert.equal(s.nodes.get('status')?.props.text, 'Idle');

  const result = work.run();

  await flushed();
  assert.equal(s.nodes.get('status')?.props.text, 'Loading');
  assert.equal(await result, 7);
  assert.equal(s.nodes.get('status')?.props.text, '7');
  assert.equal(calls, 1);
});

test('replace aborts previous signal and discards its late result', async () => {
  const s = session();
  const jobs = [deferred(), deferred()];
  const observedSignals: AbortSignal[] = [];
  const { work } = render(s, (kuito) => {
    const work = kuito.useTask(({ signal }) => {
      observedSignals.push(signal);
      return jobs[observedSignals.length - 1].promise;
    });

    return { work, text: () => String(work.data.value ?? '-') };
  });
  const first = work.run();

  await tick();

  const second = work.run();

  await tick();
  assert.equal(observedSignals.length, 2);
  assert.equal(observedSignals[0].aborted, true);
  jobs[0].resolve('obsolete');
  assert.equal(await first, 'obsolete');
  assert.equal(work.data.value, undefined);
  jobs[1].resolve('current');
  assert.equal(await second, 'current');
  assert.equal(work.data.value, 'current');
});

test('drop policy shares in-flight promise and does not duplicate work', async () => {
  const s = session();
  const job = deferred();
  let calls = 0;
  const { work } = render(s, (kuito) => {
    const work = kuito.useTask(
      () => {
        calls++;
        return job.promise;
      },
      { policy: 'drop' },
    );

    return { work, text: 'ready' };
  });
  const a = work.run();
  const b = work.run();

  assert.strictEqual(a, b);
  await tick();
  assert.equal(calls, 1);
  job.resolve('saved');
  assert.equal(await b, 'saved');
});

test('Fast Refresh cancels old tasks, preserving the data signal identity', async () => {
  const s = session();
  const pending = deferred();
  const old = render(s, (kuito) => {
    const work = kuito.useTask(() => pending.promise);

    return { work, text: () => String(work.data.value ?? '-') };
  }).work;
  const oldResult = old.run();

  await tick();

  const latest = render(s, (kuito) => {
    const work = kuito.useTask(async () => 'fresh');

    return { work, text: () => String(work.data.value ?? '-') };
  }).work;

  assert.strictEqual(latest.data, old.data);
  assert.equal(old.running.value, false);
  pending.resolve('stale');
  await oldResult;
  assert.equal(latest.data.value, undefined);
  assert.equal(await latest.run(), 'fresh');
  assert.equal(latest.data.value, 'fresh');
  await assert.rejects(old.run(), /not mounted/);
});

test("a refresh keeps the task's signals by name and drops stale work", async () => {
  const s = session();
  const pending = deferred();
  const setup = (kuito: KuitoKernel) => {
    const work = kuito.useTask(() => pending.promise, undefined, 'work');

    return { work, text: 'ok' };
  };
  const original = render(s, setup).work;
  const inFlight = original.run();

  await tick();

  const refreshed = render(s, setup).work;

  assert.strictEqual(refreshed.running, original.running, 'the task keeps its state by name');
  assert.equal(original.running.value, false);
  pending.resolve('late');
  await inFlight;
  assert.equal(refreshed.data.value, undefined);
  assert.equal(s.sandbox.__kuito.dispose('app'), true);
});

test('resource autostarts after commit and captures rejection reactively', async () => {
  const s = session();
  const successful = render(s, (kuito) => {
    const value = kuito.useResource(async () => 42);

    return { value, text: () => String(value.data.value ?? '-') };
  }).value;

  assert.equal(successful.data.value, undefined);
  await tick();
  assert.equal(successful.data.value, 42);

  const failing = render(s, (kuito) => {
    const value = kuito.useResource(async () => {
      throw Error('offline');
    });

    return { value, text: () => String(value.error.value?.message ?? '-') };
  }).value;

  await tick();
  assert.equal(failing.error.value?.message, 'offline');
  assert.equal(failing.running.value, false);
});

test('task rejects invalid policies and use outside components', () => {
  const s = session();

  assert.throws(
    () =>
      render(s, (kuito) => ({
        text: 'invalid',
        work: kuito.useTask(() => 1, { policy: 'queue' }),
      })),
    /Unknown task policy/,
  );

  assert.equal(s.sandbox.__kuito.revision('app'), 0);
  assert.throws(() => s.sandbox.__kuito.useTask(async () => 1), /during component initialization/);
});
