import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import {
  installKernel,
  type HostView,
  type PatchApi,
  type Signal,
  type VNode,
} from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

function make() {
  const views = new Map<string, HostView>();
  const errors: unknown[][] = [];
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
      console: { error: (...args: unknown[]) => errors.push(args) },
    }),
  );
  // Sorted: which texts show, not the order their views were made in.
  const texts = () =>
    [...views.values()]
      .filter((view) => view.kind === 'Text')
      .map((view) => String(view.props.text))
      .sort();

  return {
    jsx: host.__kuitoJSX,
    expr: <T>(key: string, evaluate: () => T) => host.__kuitoExpr(key, evaluate),
    kuito: host.__kuito,
    texts,
    errors,
  };
}

/** Wait for what a write scheduled (a re-plan, a resource) until `check` holds. */
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;

  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time');

    await new Promise((resolve) => setImmediate(resolve));
  }
}

type Retry = () => void;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A fallback that shows the error's message and keeps `retry` for the test. */
function fallback(jsx: ReturnType<typeof make>['jsx'], kept: { retry?: Retry }) {
  return (error: unknown, retry: Retry) => {
    kept.retry = retry;

    return jsx('Text', { id: 'fallback', text: 'failed: ' + message(error) });
  };
}

test('Catch renders its fallback when a component under it throws while rendering', async () => {
  const { jsx, kuito, texts } = make();
  const kept: { retry?: Retry } = {};
  let broken = true;

  function Profile(): VNode {
    if (broken) throw new Error('no profile');

    return jsx('Text', { id: 'profile', text: 'profile' });
  }

  kuito.patch('render-error', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'title', text: 'title' }),
        jsx('Catch', { fallback: fallback(jsx, kept) }, jsx(Profile, {})),
      ),
    );
  });

  assert.deepEqual(texts(), ['failed: no profile', 'title']);

  broken = false;
  present(kept.retry, 'retry')();
  await until(() => texts().includes('profile'));
  assert.deepEqual(texts(), ['profile', 'title']);
});

test('a Catch fallback can be an element', () => {
  const { jsx, kuito, texts } = make();

  function Broken(): VNode {
    throw new Error('broken');
  }

  kuito.patch('element-fallback', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Catch', { fallback: jsx('Text', { id: 'oops', text: 'oops' }) }, jsx(Broken, {})),
      ),
    );
  });

  assert.deepEqual(texts(), ['oops']);
});

test('a render error in a re-planned branch reaches the Catch around it', async () => {
  const { jsx, kuito, texts } = make();
  let open!: Signal<boolean>;

  function Detail(): VNode {
    throw new Error('no detail');
  }

  kuito.patch('branch-error', (api) => {
    open = api.state('open', false);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Catch',
          { fallback: (error: unknown) => jsx('Text', { id: 'fallback', text: message(error) }) },
          jsx(
            'Show',
            { when: () => open.value, fallback: jsx('Text', { id: 'closed', text: 'closed' }) },
            jsx(Detail, {}),
          ),
        ),
      ),
    );
  });

  assert.deepEqual(texts(), ['closed']);

  open.value = true;
  await until(() => texts().includes('no detail'));
  assert.deepEqual(texts(), ['no detail']);
});

test('a throw in a fallback reaches the Catch outside it', () => {
  const { jsx, kuito, texts } = make();

  function Broken(): VNode {
    throw new Error('inner');
  }

  kuito.patch('nested', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Catch',
          {
            fallback: (error: unknown) =>
              jsx('Text', { id: 'outer', text: 'outer: ' + message(error) }),
          },
          jsx(
            'Catch',
            {
              fallback: () => {
                throw new Error('fallback broke');
              },
            },
            jsx(Broken, {}),
          ),
        ),
      ),
    );
  });

  assert.deepEqual(texts(), ['outer: fallback broke']);
});

test('a render error with no Catch around it still fails the patch', () => {
  const { jsx, kuito } = make();

  function Broken(): VNode {
    throw new Error('uncaught');
  }

  assert.throws(
    () =>
      kuito.patch('uncaught', (api) => api.render(jsx('VStack', { id: 'root' }, jsx(Broken, {})))),
    /uncaught/,
  );
});

test('Catch renders its fallback when an effect under it throws', async () => {
  const { jsx, kuito, texts } = make();
  let count!: Signal<number>;

  function Counter(): VNode {
    kuito.useLifecycle('effect', () => {
      if (count.value > 1) throw new Error('too many');
    });

    return jsx('Text', { id: 'count', text: 'counter' });
  }

  kuito.patch('effect-error', (api) => {
    count = api.state('count', 0);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Catch',
          { fallback: (error: unknown) => jsx('Text', { id: 'fallback', text: message(error) }) },
          jsx(Counter, {}),
        ),
      ),
    );
  });

  assert.deepEqual(texts(), ['counter']);

  count.value = 2;
  await until(() => texts().includes('too many'));
  assert.deepEqual(texts(), ['too many']);
});

test('Catch renders its fallback when onMount under it throws', async () => {
  const { jsx, kuito, texts } = make();

  function Mounting(): VNode {
    kuito.useLifecycle('mount', () => {
      throw new Error('mount failed');
    });

    return jsx('Text', { id: 'mounting', text: 'mounting' });
  }

  kuito.patch('mount-error', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Catch',
          { fallback: (error: unknown) => jsx('Text', { id: 'fallback', text: message(error) }) },
          jsx(Mounting, {}),
        ),
      ),
    );
  });

  await until(() => texts().includes('mount failed'));
  assert.deepEqual(texts(), ['mount failed']);
});

test('a resource failure nothing reads reaches the Catch, and retry runs it again', async () => {
  const { jsx, kuito, texts } = make();
  const kept: { retry?: Retry } = {};
  let attempts = 0;

  function Feed(): VNode {
    const feed = kuito.useResource(async () => {
      attempts++;

      if (attempts === 1) throw new Error('offline');

      return 'posts';
    });

    return jsx('Text', { id: 'feed', text: () => feed.data.value ?? 'loading' });
  }

  kuito.patch('resource-error', (api) => {
    api.render(
      jsx('VStack', { id: 'root' }, jsx('Catch', { fallback: fallback(jsx, kept) }, jsx(Feed, {}))),
    );
  });

  await until(() => texts().includes('failed: offline'));
  assert.deepEqual(texts(), ['failed: offline']);

  present(kept.retry, 'retry')();
  await until(() => texts().includes('posts'));
  assert.equal(attempts, 2);
});

test('a resource whose error the component reads handles its failure itself', async () => {
  const { jsx, kuito, texts } = make();

  function Feed(): VNode {
    const feed = kuito.useResource(async () => {
      throw new Error('offline');
    });

    return jsx('Text', {
      id: 'feed',
      text: () => (feed.error.value ? 'inline: ' + message(feed.error.value) : '-'),
    });
  }

  kuito.patch('resource-handled', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Catch', { fallback: jsx('Text', { id: 'fallback', text: 'caught' }) }, jsx(Feed, {})),
      ),
    );
  });

  await until(() => texts().includes('inline: offline'));
  assert.deepEqual(texts(), ['inline: offline']);
});

test('a resource whose error is read only once it stops running still handles its failure', async () => {
  const { jsx, kuito, texts } = make();
  const load = Promise.withResolvers<string>();

  function Feed(): VNode {
    const feed = kuito.useResource(() => load.promise);

    return jsx('Text', {
      id: 'feed',
      text: () =>
        feed.running.value
          ? 'loading'
          : feed.error.value
            ? 'inline: ' + message(feed.error.value)
            : String(feed.data.value ?? '-'),
    });
  }

  kuito.patch('resource-later', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Catch', { fallback: jsx('Text', { id: 'fallback', text: 'caught' }) }, jsx(Feed, {})),
      ),
    );
  });

  await until(() => texts().includes('loading'));
  load.reject(new Error('offline'));
  await until(() => texts().includes('inline: offline'));
  assert.deepEqual(texts(), ['inline: offline']);
});

test('a resource failure nothing reads or catches reaches the reporting seam', async () => {
  const { jsx, kuito, errors } = make();

  function Feed(): VNode {
    kuito.useResource(async () => {
      throw new Error('offline');
    });

    return jsx('Text', { id: 'feed', text: 'feed' });
  }

  kuito.patch('resource-uncaught', (api) => {
    api.render(jsx('VStack', { id: 'root' }, jsx(Feed, {})));
  });

  await until(() => errors.length > 0);
  assert.match(String(errors[0][0]), /resource/);
  assert.equal(message(errors[0][1]), 'offline');
});

test('a Catch keeps its fallback when the module re-plans, and a Live Patch renders its children again', async () => {
  const { jsx, kuito, texts } = make();
  let title!: Signal<string>;

  function Broken(): VNode {
    throw new Error('broken');
  }

  function Fixed(): VNode {
    return jsx('Text', { id: 'fixed', text: 'fixed' });
  }

  const screen = (child: (props: Record<string, unknown>) => unknown) => (api: PatchApi) => {
    title = api.state('title', 'a');

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        // Read outside any branch owner: a change re-plans the whole module.
        title.value === 'a'
          ? jsx('Text', { id: 'a', text: 'a' })
          : jsx('Text', { id: 'b', text: 'b' }),
        jsx('Catch', { fallback: jsx('Text', { id: 'oops', text: 'oops' }) }, jsx(child, {})),
      ),
    );
  };
  const broken = screen(Broken);

  kuito.patch('live', broken);
  assert.deepEqual(texts(), ['a', 'oops']);

  title.value = 'b';
  kuito.patch('live', broken);
  assert.deepEqual(texts(), ['b', 'oops']);

  kuito.patch('live', screen(Fixed));
  await until(() => texts().includes('fixed'));
  assert.deepEqual(texts(), ['b', 'fixed']);
});

test('a Catch whose path changes on every render fails the patch with the error it took', () => {
  const { jsx, kuito } = make();

  function Broken(): VNode {
    throw new Error('row broke');
  }

  // New objects each render: each row, and the Catch in it, is a new instance every time.
  assert.throws(
    () =>
      kuito.patch('unstable', (api) =>
        api.render(
          jsx('For', { each: [{ n: 1 }].map((item) => ({ ...item })) }, () =>
            jsx('Catch', { fallback: jsx('Text', { text: 'oops' }) }, jsx(Broken, {})),
          ),
        ),
      ),
    /row broke/,
  );
});

test('a compiled fallback naming a function still gets the error and retry', () => {
  const { jsx, expr, kuito, texts } = make();
  const renderError = (error: unknown, retry: Retry) =>
    jsx('Text', {
      id: 'named',
      text: message(error) + (typeof retry === 'function' ? ' +retry' : ''),
    });

  function Broken(): VNode {
    throw new Error('broken');
  }

  kuito.patch('named-fallback', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Catch', { fallback: expr('fallback', () => renderError) }, jsx(Broken, {})),
      ),
    );
  });

  assert.deepEqual(texts(), ['broken +retry']);
});

test('a patch that fails elsewhere leaves a committed Catch as it was', async () => {
  const { jsx, kuito, texts } = make();
  let mode = 0;

  function Child(): VNode {
    if (mode === 1) throw new Error('child');

    return jsx('Text', { id: 'child', text: 'child ok' });
  }

  function Sibling(): VNode {
    if (mode === 1) throw new Error('sibling');

    return jsx('Text', { id: 'sibling', text: 'sibling' });
  }

  const register = (api: PatchApi) =>
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Catch', { fallback: jsx('Text', { id: 'oops', text: 'oops' }) }, jsx(Child, {})),
        jsx(Sibling, {}),
      ),
    );

  kuito.patch('failed-elsewhere', register);
  mode = 1;
  assert.throws(() => kuito.patch('failed-elsewhere', register), /sibling/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(texts(), ['child ok', 'sibling']);

  mode = 2;
  kuito.patch('failed-elsewhere', register);
  assert.deepEqual(texts(), ['child ok', 'sibling']);
});

test('a component that re-renders while its resource loads still handles the failure it renders', async () => {
  const { jsx, kuito, texts } = make();
  const load = Promise.withResolvers<string>();
  let label = 'a';

  function Feed(props: Record<string, unknown>): VNode {
    const feed = kuito.useResource(() => load.promise);

    return jsx('Text', {
      id: 'feed',
      text: () =>
        feed.running.value
          ? 'loading ' + String(props.label)
          : feed.error.value
            ? 'inline: ' + message(feed.error.value)
            : '-',
    });
  }

  const register = (api: PatchApi) =>
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Catch',
          { fallback: jsx('Text', { id: 'fallback', text: 'caught' }) },
          jsx(Feed, { label }),
        ),
      ),
    );

  kuito.patch('rerun', register);
  await until(() => texts().includes('loading a'));
  label = 'b';
  kuito.patch('rerun', register);
  await until(() => texts().includes('loading b'));
  load.reject(new Error('offline'));
  await until(() => texts().includes('inline: offline') || texts().includes('caught'));
  assert.deepEqual(texts(), ['inline: offline']);
});

test('a refresh whose caller handles its failure does not reach the Catch', async () => {
  const { jsx, kuito, texts } = make();
  let fail = false;
  let refresh!: () => Promise<unknown>;

  function Feed(): VNode {
    const feed = kuito.useResource(async () => {
      if (fail) throw new Error('offline');

      return 'posts';
    });

    refresh = () => feed.refresh();

    return jsx('Text', { id: 'feed', text: () => String(feed.data.value ?? '-') });
  }

  kuito.patch('refresh-handled', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Catch', { fallback: jsx('Text', { id: 'fallback', text: 'caught' }) }, jsx(Feed, {})),
      ),
    );
  });

  await until(() => texts().includes('posts'));
  fail = true;

  let handled = false;

  await refresh().catch(() => {
    handled = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handled, true);
  assert.deepEqual(texts(), ['posts']);
});

test('an error that arrives after a Catch took one is reported', async () => {
  const { jsx, kuito, texts, errors } = make();

  function Failing(props: Record<string, unknown>): VNode {
    kuito.useResource(async () => {
      throw new Error(String(props.name));
    });

    return jsx('Text', { text: 'loading' });
  }

  kuito.patch('second-error', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Catch',
          { fallback: (error: unknown) => jsx('Text', { id: 'fallback', text: message(error) }) },
          jsx(Failing, { name: 'first' }),
          jsx(Failing, { name: 'second' }),
        ),
      ),
    );
  });

  await until(() => texts().includes('first') && errors.length > 0);
  assert.deepEqual(texts(), ['first']);
  assert.equal(message(errors[0][1]), 'second');
});
