import { onTestFinished, test, vi } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import {
  adapt,
  back,
  dismiss,
  entryKeys,
  focused,
  initialState,
  linkDestination,
  linkPath,
  matchPath,
  navigate,
  present,
  selectTab,
  type Entry,
  type NavigationState,
  type RouteTable,
} from '../src/runtime/routes.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

test('paths match segments, :parameters and a final *name', () => {
  assert.deepEqual(matchPath('/show/:id', '/show/42'), { id: '42' });
  assert.deepEqual(matchPath('/show/:id', '/show/42/'), { id: '42' });
  assert.deepEqual(matchPath('/', '/'), {});
  assert.deepEqual(matchPath('/files/*rest', '/files/a/b%20c'), { rest: 'a/b c' });
  assert.deepEqual(matchPath('/show/:id', '/show/a%2Fb?tab=cast#top'), { id: 'a/b' });
  assert.equal(matchPath('/show/:id', '/show'), null);
  assert.equal(matchPath('/show/:id', '/shows/42'), null);
  assert.equal(matchPath('/', '/library'), null);
});

test('a link’s path: after a custom scheme, the host is the first segment', () => {
  assert.equal(linkPath('kuito://show/42'), '/show/42');
  assert.equal(linkPath('kuito:///show/42'), '/show/42');
  assert.equal(linkPath('kuito:show/42'), '/show/42');
  assert.equal(linkPath('kuito://'), '/');
  assert.equal(linkPath('kuito://show/42?ref=mail#cast'), '/show/42?ref=mail#cast');
  assert.equal(linkPath('my-app+dev://library'), '/library');
  assert.equal(linkPath('https://kuito.dev/show/42'), '/show/42', 'a web link’s host is the site');
  assert.equal(linkPath('http://localhost:8080'), '/');
  assert.equal(linkPath('HTTPS://kuito.dev/library?x=1'), '/library?x=1');
  assert.throws(() => linkPath('/show/42'), /\/show\/42 is not a URL/);
});

// Two tabs and a sheet, as <Router><Tabs>…</Tabs><Route sheet/></Router> declares them.
const table: RouteTable = {
  tabs: ['home', 'library'],
  routes: [
    { name: 'index', path: '/', params: {}, tab: 0, presentation: 'push' },
    { name: 'show', path: '/show/:id', params: { id: 'number' }, tab: 0, presentation: 'push' },
    { name: 'library', path: '/library', params: {}, tab: 1, presentation: 'push' },
    { name: 'list', path: '/library/:list', params: {}, tab: 1, presentation: 'push' },
    { name: 'settings', path: '/settings', params: {}, tab: null, presentation: 'sheet' },
  ],
};

const to = (route: string, params: Record<string, string | number | boolean> = {}) => ({
  route,
  params,
});

/** An entry as its route's name and params, like `show 1`. */
const label = (state: NavigationState, entry: Entry) =>
  [state.table.routes[entry.route].name, ...Object.values(entry.params)].join(' ');

/** Each stack's entries, the presented screens' and the selected tab. */
const shape = (state: NavigationState) => ({
  tab: state.tab,
  stacks: state.stacks.map((stack) => stack.map((entry) => label(state, entry))),
  presented: state.presented.map((entry) => label(state, entry)),
});

test('a link’s destination: the first route its path matches, params parsed by kind', () => {
  assert.deepEqual(linkDestination(table, 'kuito://show/42'), to('show', { id: 42 }));

  assert.deepEqual(linkDestination(table, 'https://kuito.dev/library/to%20watch'), {
    route: 'list',
    params: { list: 'to watch' },
  });

  assert.deepEqual(linkDestination(table, 'kuito://'), to('index'));
  assert.equal(linkDestination(table, 'kuito://show/forty'), null, 'id is a number');
  assert.equal(linkDestination(table, 'kuito://nowhere'), null);
});

test('params a path does not name come from the link’s query, parsed by kind', () => {
  const searching: RouteTable = {
    tabs: [],
    routes: [
      {
        name: 'search',
        path: '/search',
        params: { q: 'string', page: 'number', exact: 'boolean' },
        tab: null,
        presentation: 'push',
      },
    ],
  };

  assert.deepEqual(
    linkDestination(searching, 'kuito://search?q=the%20bear&page=2&exact=true&ref=mail#top'),
    to('search', { q: 'the bear', page: 2, exact: true }),
    'a query key the route has no param for is ignored',
  );

  assert.deepEqual(linkDestination(searching, 'kuito://search'), to('search'));
  assert.equal(linkDestination(searching, 'kuito://search?exact=yes'), null);
  assert.equal(linkDestination(searching, 'kuito://search?page=2.5x'), null);
});

test('the initial state shows each tab its first route', () => {
  assert.deepEqual(shape(initialState(table)), {
    tab: 0,
    stacks: [['index'], ['library']],
    presented: [],
  });

  assert.deepEqual(
    shape(initialState(table, to('show', { id: 7 }))),
    { tab: 0, stacks: [['index', 'show 7'], ['library']], presented: [] },
    'a deeper initial route sits on its tab’s first route',
  );
});

test('navigate pushes on the route’s stack, selecting its tab', () => {
  let state = initialState(table);

  state = navigate(state, table, to('show', { id: 1 }));
  state = navigate(state, table, to('show', { id: 1 }));
  state = navigate(state, table, to('list', { list: 'watched' }));

  assert.deepEqual(shape(state), {
    tab: 1,
    stacks: [
      ['index', 'show 1'],
      ['library', 'list watched'],
    ],
    presented: [],
  });

  const [, show] = state.stacks[0];

  assert.deepEqual(show.params, { id: 1 });
  assert.equal(show.route, 1);
});

test('a tab’s first route pops that tab to it; replace swaps the top', () => {
  let state = navigate(
    navigate(initialState(table), table, to('show', { id: 1 })),
    table,
    to('show', { id: 2 }),
  );

  state = navigate(state, table, to('show', { id: 3 }), { replace: true });
  assert.deepEqual(shape(state).stacks[0], ['index', 'show 1', 'show 3']);

  state = navigate(state, table, to('index'));
  assert.deepEqual(shape(state).stacks[0], ['index']);
});

test('a destination names a route the table has, with each path param a value of its kind', () => {
  const state = initialState(table);

  assert.throws(
    () => navigate(state, table, to('nowhere')),
    /No route is named nowhere; the routes are index, show, library, list and settings/,
  );

  assert.throws(() => navigate(state, table, to('show')), /routes\.show needs its id param/);

  assert.throws(
    () => navigate(state, table, to('show', { id: '1' })),
    /routes\.show's id param must be a number, not "1"/,
  );

  assert.throws(
    () => navigate(state, table, { route: 'list', params: { list: {} } } as never),
    /routes\.list's list param must be a string, not \{\}/,
  );
});

test('present always shows a new screen, and says which', () => {
  let state = navigate(initialState(table), table, to('show', { id: 1 }));
  const shown = present(state, table, to('show', { id: 1 }));

  state = shown.state;
  assert.deepEqual(shape(state).stacks[0], ['index', 'show 1', 'show 1'], 'even one on top');
  assert.equal(focused(state).key, shown.key);

  const sheet = present(state, table, to('settings'));

  assert.deepEqual(shape(sheet.state).presented, ['settings']);
  assert.equal(focused(sheet.state).key, sheet.key);
  assert.notEqual(sheet.key, shown.key);
});

test('sheets open over everything and close first on back', () => {
  let state = navigate(
    navigate(initialState(table), table, to('show', { id: 1 })),
    table,
    to('settings'),
  );

  assert.deepEqual(shape(state).presented, ['settings']);

  state = back(state);

  assert.deepEqual(shape(state), {
    tab: 0,
    stacks: [['index', 'show 1'], ['library']],
    presented: [],
  });

  state = back(back(state));
  assert.deepEqual(shape(state).stacks[0], ['index'], 'the first screen stays');
});

test('modal and full-screen routes are presented over everything, as sheets are', () => {
  const presenting: RouteTable = {
    ...table,
    routes: [
      ...table.routes,
      { name: 'compose', path: '/compose', params: {}, tab: null, presentation: 'modal' },
      { name: 'player', path: '/player', params: {}, tab: null, presentation: 'fullScreen' },
    ],
  };
  let state = navigate(initialState(presenting), presenting, to('compose'));

  state = navigate(state, presenting, to('player'));

  assert.deepEqual(shape(state), {
    tab: 0,
    stacks: [['index'], ['library']],
    presented: ['compose', 'player'],
  });

  assert.equal(label(state, focused(state)), 'player');
  assert.deepEqual(shape(back(state)).presented, ['compose'], 'back closes the top one');
});

test('the focused screen is the top sheet, else the top of the selected tab', () => {
  let state = navigate(initialState(table), table, to('show', { id: 1 }));

  assert.equal(label(state, focused(state)), 'show 1');

  state = selectTab(state, 1);
  assert.equal(label(state, focused(state)), 'library');

  state = navigate(state, table, to('settings'));
  assert.equal(label(state, focused(state)), 'settings');
});

test('a screen the platform dismissed leaves with the ones above it', () => {
  let state = initialState(table);

  for (const id of [1, 2, 3]) state = navigate(state, table, to('show', { id }));

  const [, first] = state.stacks[0];

  state = dismiss(state, first.key);
  assert.deepEqual(shape(state).stacks[0], ['index']);
  assert.equal(dismiss(state, 'gone'), state, 'an unknown key changes nothing');
});

test('keys are unique and stay with their entries', () => {
  let state = initialState(table);

  state = navigate(state, table, to('show', { id: 1 }));

  const pushed = state.stacks[0][1];

  state = selectTab(state, 1);
  state = selectTab(state, 0);

  assert.equal(state.stacks[0][1], pushed, 'switching tabs keeps entries as they were');

  const keys = [...entryKeys(navigate(state, table, to('show', { id: 2 })))];

  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes(pushed.key));
});

test('a single stack without tabs', () => {
  const single: RouteTable = {
    tabs: [],
    routes: [
      { name: 'index', path: '/', params: {}, tab: null, presentation: 'push' },
      { name: 'about', path: '/about', params: {}, tab: null, presentation: 'push' },
    ],
  };

  assert.deepEqual(shape(navigate(initialState(single), single, to('about'))), {
    tab: 0,
    stacks: [['index', 'about']],
    presented: [],
  });

  assert.throws(() => selectTab(initialState(single), 3), /There is no tab 3/);
});

test('a state follows an edited table: tabs by name, routes by name', () => {
  let state = navigate(
    navigate(initialState(table), table, to('show', { id: 1 })),
    table,
    to('settings'),
  );

  state = navigate(state, table, to('list', { list: 'watched' }));

  const edited: RouteTable = {
    tabs: ['library', 'home', 'top'],
    routes: [
      { name: 'library', path: '/library', params: {}, tab: 0, presentation: 'push' },
      { name: 'list', path: '/shelf/:list', params: {}, tab: 0, presentation: 'push' },
      { name: 'index', path: '/', params: {}, tab: 1, presentation: 'push' },
      { name: 'about', path: '/about', params: {}, tab: 1, presentation: 'push' },
      { name: 'show', path: '/show/:id', params: { id: 'number' }, tab: 1, presentation: 'push' },
      { name: 'top', path: '/top', params: {}, tab: 2, presentation: 'push' },
      { name: 'settings', path: '/settings', params: {}, tab: null, presentation: 'sheet' },
    ],
  };
  const adapted = adapt(state, edited);

  assert.deepEqual(shape(adapted), {
    tab: 0,
    stacks: [['library', 'list watched'], ['index', 'show 1'], ['top']],
    presented: ['settings'],
  });

  const show = adapted.stacks[1][1];

  assert.equal(show.key, state.stacks[0][1].key, 'an entry keeps its key');
  assert.equal(show.route, 4, 'and points at its route in the edited table');
  assert.equal(adapt(state, { ...table }), state, 'an equal table changes nothing');
});

test('entries whose route an edit removed leave, with the ones above them', () => {
  let state = navigate(
    navigate(initialState(table), table, to('show', { id: 1 })),
    table,
    to('show', { id: 2 }),
  );

  state = navigate(navigate(state, table, to('library')), table, to('settings'));

  const edited: RouteTable = {
    tabs: ['home'],
    routes: [
      { name: 'index', path: '/', params: {}, tab: 0, presentation: 'push' },
      { name: 'about', path: '/about', params: {}, tab: 0, presentation: 'push' },
    ],
  };

  assert.deepEqual(shape(adapt(state, edited)), { tab: 0, stacks: [['index']], presented: [] });
});

// --- The Router, rendered: the native views it asks for ---------------------

interface NativeView {
  kind: string;
  parent: string;
  props: Record<string, unknown>;
}

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-router-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function app(fixture: string, modules: object = {}) {
  const code = await compile(fixture);
  const logs: { level: string; message: string }[] = [];

  const views = new Map<string, NativeView>();
  const order: string[] = [];
  const kernel = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
        order.push(id);
      },
      setProp(id: string, name: string, value: unknown) {
        const view = views.get(id);

        if (view) view.props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      moveView() {},
      __kuitoHostLog(level: string, message: string) {
        logs.push({ level, message });
      },
      ...modules,
    }),
  );

  runInNewContext(code, kernel);

  const settle = () => new Promise<void>((done) => setTimeout(done, 0));
  const ofKind = (kind: string) =>
    order.flatMap((id) => {
      const view = views.get(id);

      return view?.kind === kind ? [{ id, ...view }] : [];
    });
  const textOf = (id: string) => views.get(id)?.props.text;
  const send = async (message: string) => {
    nativeEvent(kernel.__kuito, message);
    await settle();
  };

  /** A Live Patch: the app compiled again, run in the same kernel. */
  const patch = async (entry: string) => {
    runInNewContext(await compile(entry), kernel);
    await settle();
  };

  await settle();

  return { kernel, views, logs, ofKind, textOf, send, settle, patch };
}

test('a Router renders native tabs, each with its own stack', async () => {
  const router = await app('test/fixtures/router-app.tsx');
  const [tabs] = router.ofKind('NavigationTabs');

  assert.equal(tabs.props.selectedIndex, 0);

  assert.deepEqual(
    router.ofKind('NavigationTab').map((tab) => [tab.props.title, tab.props.icon ?? null]),
    [
      ['Home', { ios: 'house', android: 'home' }],
      ['Library', { uri: 'https://example.com/library.png' }],
    ],
  );

  assert.deepEqual(
    router.ofKind('NavigationScreen').map((screen) => [screen.props.title, screen.props.header]),
    [['Home', true]],
    'a tab mounts its screens when first selected',
  );

  assert.equal(router.ofKind('NavigationStack').length, 2);
  assert.equal(router.textOf('home-visits'), '0 visits');

  await router.send(tabs.id + '.select\u001f' + JSON.stringify({ index: 1 }));

  assert.deepEqual(
    router.ofKind('NavigationScreen').map((screen) => [screen.props.title, screen.props.header]),
    [
      ['Home', true],
      ['Library', false],
    ],
  );

  assert.equal(router.textOf('library'), 'library');
});

test('a Link pushes a screen with its params; the screen below keeps its state', async () => {
  const router = await app('test/fixtures/router-app.tsx');

  await router.send('home-visit.press');
  await router.send('to-show.press');

  const screens = router.ofKind('NavigationScreen');

  assert.deepEqual(
    screens.map((screen) => screen.props.title).sort((a, b) => String(a).localeCompare(String(b))),
    ['Home', 'Show 42'],
  );

  assert.equal(router.textOf('show-id'), 'show 42');
  assert.equal(router.textOf('home-visits'), '1 visits', 'Home kept its state');

  await router.send('show-back.press');

  assert.deepEqual(
    router
      .ofKind('NavigationScreen')
      .map((screen) => screen.props.title)
      .sort((a, b) => String(a).localeCompare(String(b))),
    ['Home'],
  );

  assert.equal(router.textOf('home-visits'), '1 visits');
});

test('the platform dismissing a screen and picking a tab update the state', async () => {
  const router = await app('test/fixtures/router-app.tsx');

  await router.send('to-show.press');

  const pushed = router
    .ofKind('NavigationScreen')
    .find((screen) => screen.props.title === 'Show 42');

  assert.ok(pushed);
  await router.send(pushed.id + '.dismiss');
  assert.equal(router.ofKind('NavigationScreen').length, 1);

  const [tabs] = router.ofKind('NavigationTabs');

  await router.send(tabs.id + '.select\u001f' + JSON.stringify({ index: 1 }));
  assert.equal(router.ofKind('NavigationTabs')[0].props.selectedIndex, 1);
});

test('a sheet route opens a native sheet that closes like back', async () => {
  const router = await app('test/fixtures/router-app.tsx');

  await router.send('to-settings.press');

  const [sheet] = router.ofKind('Sheet');

  assert.ok(sheet, 'a sheet is open');
  assert.equal(sheet.props.open, true);
  assert.equal(router.textOf('settings'), 'settings');

  await router.send(sheet.id + '.close');
  assert.equal(router.ofKind('Sheet').length, 0);
});

test('a modal or full-screen route shows its screen in a stack of its own, under its header', async () => {
  const router = await app('test/fixtures/router-app.tsx');

  await router.send('to-compose.press');

  const [modal] = router.ofKind('Sheet');

  assert.equal(modal?.props.presentation, 'modal');

  const stack = router.ofKind('NavigationStack').find((each) => each.parent === modal.id);
  const screen = router.ofKind('NavigationScreen').find((each) => each.parent === stack?.id);

  assert.equal(screen?.props.title, 'New list');
  assert.equal(router.textOf('compose'), 'compose');

  await router.send(modal.id + '.close');
  assert.equal(router.ofKind('Sheet').length, 0);

  await router.send('to-player.press');

  assert.deepEqual(
    router.ofKind('Sheet').map((each) => each.props.presentation),
    ['fullScreen'],
  );

  assert.equal(router.textOf('player'), 'player');
});

test('a sheet route opens a native sheet of its own presentation', async () => {
  const router = await app('test/fixtures/router-app.tsx');

  await router.send('to-settings.press');

  const [sheet] = router.ofKind('Sheet');

  assert.equal(sheet.props.presentation, undefined, 'the default');

  assert.equal(
    router.ofKind('NavigationStack').filter((each) => each.parent === sheet.id).length,
    0,
  );
});

test('an image icon that fails to load is an error naming its tab', async () => {
  const router = await app('test/fixtures/router-app.tsx');
  const library = router.ofKind('NavigationTab').find((tab) => tab.props.title === 'Library');

  assert.ok(library);

  await assert.rejects(
    router.send(library.id + '.error\u001f' + JSON.stringify({ error: 'HTTP 404' })),
    /<Tab name="library"> icon did not load: HTTP 404/,
  );
});

test('a tab icon is a symbol name, per-platform names or an image', async () => {
  await assert.rejects(
    app('test/fixtures/router-bad-icon.tsx'),
    /<Tab name="home"> icon must be a symbol name, \{ ios, android \} or \{ uri \}/,
  );
});

// --- Screen results: present() resolves with what the screen dismisses with ---

test('present resolves with the result the presented screen dismisses with', async () => {
  const router = await app('test/fixtures/router-results-app.tsx');

  await router.send('pick.press');

  const [sheet] = router.ofKind('Sheet');

  assert.ok(sheet, 'the picker opens in a sheet');
  assert.deepEqual(sheet.props.snapPoints, ['40%', '100%'], 'at its snap points');
  assert.equal(router.textOf('picker-from'), 'from home', 'with its params as props');

  await router.send('choose.press');

  assert.equal(router.ofKind('Sheet').length, 0, 'dismiss closes it');
  assert.equal(router.textOf('picked'), 'red');
});

test('present resolves undefined when the user closes the presented screen', async () => {
  const router = await app('test/fixtures/router-results-app.tsx');

  await router.send('pick.press');
  await router.send(router.ofKind('Sheet')[0].id + '.close');

  assert.equal(router.textOf('picked'), 'none');

  await router.send('rate.press');

  const details = router
    .ofKind('NavigationScreen')
    .find((screen) => screen.props.title === 'Details');

  assert.ok(details, 'a push route is pushed');
  await router.send(details.id + '.dismiss');
  assert.equal(router.textOf('rated'), 'skipped', 'the platform popped it');

  await router.send('rate.press');
  await router.send('five.press');

  assert.deepEqual(titles(router), ['Home']);
  assert.equal(router.textOf('rated'), '5 stars');
});

test('a route’s backgroundColor fills its whole screen, under the bars', async () => {
  const router = await app('test/fixtures/router-results-app.tsx');
  const home = router.ofKind('NavigationScreen').find((screen) => screen.props.title === 'Home');

  assert.equal(home?.props.backgroundColor, '#08080b');
});

test('a route’s header slot sends its items, large title and search to the native header', async () => {
  const router = await app('test/fixtures/router-header-app.tsx');
  const [shows] = router.ofKind('NavigationScreen');

  assert.equal(shows.props.header, true);

  assert.deepEqual(shows.props.headerItems, [
    { label: 'Edit', placement: 'leading' },
    { label: 'Add', icon: { ios: 'plus', android: 'add' }, placement: 'trailing' },
    { label: 'Share', icon: 'square.and.arrow.up', disabled: true, placement: 'trailing' },
  ]);

  assert.equal(shows.props.largeTitle, true);
  assert.deepEqual(shows.props.search, { placeholder: 'Shows' });
});

test('pressing a header item runs its onPress; the search field reports its text', async () => {
  const router = await app('test/fixtures/router-header-app.tsx');
  const [shows] = router.ofKind('NavigationScreen');

  await router.send(shows.id + '.headeritem\u001f' + JSON.stringify({ index: 1 }));
  assert.equal(router.textOf('added'), '1 added', 'the second item, the first trailing one');

  await router.send(shows.id + '.search\u001f' + JSON.stringify({ text: 'bear' }));
  assert.equal(router.textOf('query'), 'bear');

  await router.send(shows.id + '.searchsubmit\u001f' + JSON.stringify({ text: 'the bear' }));
  assert.equal(router.textOf('submitted'), 'the bear');
});

test('a header may be a function of the params, or false to hide it', async () => {
  const router = await app('test/fixtures/router-header-app.tsx');

  await router.send('to-show.press');

  const show = router.ofKind('NavigationScreen').find((each) => each.props.title === '');

  assert.deepEqual(show?.props.headerItems, [
    { label: 'Rate 7', placement: 'trailing' },
  ]);

  assert.equal(show?.props.largeTitle ?? null, null, 'a small title unless asked');
  assert.equal(show?.props.search ?? null, null);

  await router.send('to-about.press');

  const about = router.ofKind('NavigationScreen').find((each) => each.props.header === false);

  assert.ok(about, 'header false hides it');
  assert.equal(about.props.headerItems ?? null, null);
});

test('a header function follows the signals it reads', async () => {
  const router = await app('test/fixtures/router-header-app.tsx');

  await router.send('to-show.press');

  const show = router.ofKind('NavigationScreen').find((each) => each.props.title === '');

  assert.ok(show);
  await router.send(show.id + '.headeritem\u001f' + JSON.stringify({ index: 0 }));

  assert.deepEqual(show.props.headerItems, [
    { label: 'Rate 7', disabled: true, placement: 'trailing' },
  ]);
});

test('a header item needs a label and an onPress', async () => {
  await assert.rejects(
    app('test/fixtures/router-bad-header.tsx'),
    /<Route name="index"> header's trailing items each need a label and an onPress/,
  );
});

test('a header takes only its own options', async () => {
  await assert.rejects(
    app('test/fixtures/router-misspelled-header.tsx'),
    /<Route name="index"> header has no trailling; it takes leading, trailing, largeTitle, search/,
  );
});

test('an app has one Router', async () => {
  await assert.rejects(
    app('test/fixtures/router-twice-app.tsx'),
    /An app has one <Router>, and this is a second one/,
  );
});

// --- Shared elements: a view the stack flies from one screen to the next ---

test('a sharedId reaches the native view, which it keeps from being flattened', async () => {
  const router = await app('test/fixtures/router-shared-app.tsx');

  await router.send('to-show.press');

  assert.equal(router.views.get('poster-small')?.props.sharedId, 'poster-7');
  assert.equal(router.views.get('poster-large')?.props.sharedId, 'poster-7');
});

// --- Deep links: a Router with `linking` follows the URLs the app opens with ---

/** A Linking module that launched the app with `initial`, then each link it emits. */
function linking(initial: string | null) {
  return fakeModules({
    Linking: {
      functions: { url: { thread: 'js', run: () => initial } },
    },
  });
}

async function linked(initial: string | null, fixture = 'test/fixtures/router-linking-app.tsx') {
  const native = linking(initial);
  const router = await app(fixture, native.host);

  native.attach(router.kernel);
  native.flush();
  await router.settle();

  /** A link that arrives while the app runs. */
  const open = async (url: string) => {
    native.emit('Linking', 'url', url);
    await router.settle();
  };

  return { ...router, native, open };
}

test('a Router with linking shows the deep link the app launched with', async () => {
  const router = await linked('kuito://show/7');

  assert.deepEqual(titles(router), ['Home', 'Show 7']);
  assert.equal(router.textOf('show-id'), 'show 7');
});

test('a link that arrives while the app runs navigates to its route', async () => {
  const router = await linked(null);

  assert.deepEqual(router.native.observed, ['start Linking.url']);
  assert.deepEqual(titles(router), ['Home']);

  await router.open('kuito://library');
  assert.equal(router.ofKind('NavigationTabs')[0].props.selectedIndex, 1);

  await router.open('https://kuito.dev/show/9?ref=mail');
  assert.equal(router.ofKind('NavigationTabs')[0].props.selectedIndex, 0);
  assert.equal(router.textOf('show-id'), 'show 9');

  await router.open('kuito://settings');
  assert.equal(router.ofKind('Sheet').length, 1, 'a sheet route opens a sheet');
});

test('a link no route matches is a warning; the screens stay', async () => {
  const router = await linked(null);

  await router.open('kuito://nowhere/1');

  assert.deepEqual(titles(router), ['Home']);

  assert.deepEqual(
    router.logs.filter((log) => log.level === 'warn').map((log) => log.message),
    ['No route matches the link kuito://nowhere/1 (/nowhere/1); it was ignored'],
  );
});

test('a Router without linking leaves the Linking module alone', async () => {
  const native = linking('kuito://show/7');
  const router = await app('test/fixtures/router-app.tsx', native.host);

  native.attach(router.kernel);
  native.flush();
  await router.settle();

  assert.deepEqual(native.loads, []);
  assert.deepEqual(titles(router), ['Home']);
});

// --- File-based routes: an app directory compiles to the same Router ---------

test('an app directory renders the tabs, titles and headers its files declare', async () => {
  const router = await app('test/fixtures/file-router-app');

  assert.equal(router.ofKind('NavigationTabs')[0].props.selectedIndex, 0);

  assert.deepEqual(
    router.ofKind('NavigationTab').map((tab) => [tab.props.title, tab.props.icon ?? null]),
    [
      ['Home', 'home'],
      ['Library', null],
    ],
  );

  const [tabs] = router.ofKind('NavigationTabs');

  await router.send(tabs.id + '.select\u001f' + JSON.stringify({ index: 1 }));

  assert.deepEqual(
    router.ofKind('NavigationScreen').map((screen) => [screen.props.title, screen.props.header]),
    [
      ['Home', true],
      ['Library', false],
    ],
  );

  assert.equal(router.textOf('home-visits'), '0 visits');
});

test('a [param] file is pushed with its params; an options sheet opens a sheet', async () => {
  const router = await app('test/fixtures/file-router-app');

  await router.send('to-show.press');
  assert.equal(router.textOf('show-id'), 'show 42');
  assert.ok(router.ofKind('NavigationScreen').some((screen) => screen.props.title === 'Show 42'));

  await router.send('show-back.press');
  await router.send('to-settings.press');

  const [sheet] = router.ofKind('Sheet');

  assert.ok(sheet, 'a sheet is open');
  assert.equal(router.textOf('settings'), 'settings');
});

test('a route file without options compiles without warnings', async () => {
  const warnings: unknown[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => warnings.push(args));
  const write = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    warnings.push(chunk);

    return true;
  });

  try {
    const router = await app('test/fixtures/file-router-app');

    await router.send('to-show.press');
  } finally {
    warn.mockRestore();
    write.mockRestore();
  }

  assert.deepEqual(
    warnings.map(String).filter((line) => /IMPORT_IS_UNDEFINED/.test(line)),
    [],
  );
});

test('an app directory whose _layout exports linking follows deep links', async () => {
  const router = await linked('kuito://show/7', 'test/fixtures/file-router-linking-app');

  assert.equal(router.textOf('show-7'), 'show number 7', 'its Params type makes id a number');

  await router.open('kuito://show/9');
  assert.deepEqual(titles(router), ['Home', 'Show 7', 'Show 9']);
});

test('compiling an app directory writes its routes’ types beside them', async () => {
  mkdirSync('dist', { recursive: true });

  const copy = join(mkdtempSync(resolve('dist/kuito-routes-')), 'app');

  try {
    cpSync(resolve('test/fixtures/file-router-app'), copy, { recursive: true });
    rmSync(join(copy, 'routes.generated.d.ts'), { force: true });
    await compile(copy);

    const types = readFileSync(join(copy, 'routes.generated.d.ts'), 'utf8');

    assert.match(types, /"show": RouteTo<import\("\.\/\(home\)\/show\/\[id\]"\)\.Params>;/);
    assert.match(types, /"list": RouteTo<\{ "list": string \}>;/);

    assert.equal(
      types,
      readFileSync('test/fixtures/file-router-app/routes.generated.d.ts', 'utf8'),
      'the fixture’s own types are current',
    );
  } finally {
    rmSync(dirname(copy), { recursive: true, force: true });
  }
});

test('a Live Patch that moves a route file changes the route table', async () => {
  // Inside the repository, so the copy resolves kuito like the fixture.
  mkdirSync('dist', { recursive: true });

  const copy = join(mkdtempSync(resolve('dist/kuito-routes-')), 'app');

  try {
    cpSync(resolve('test/fixtures/file-router-app'), copy, { recursive: true });

    const router = await app(copy);
    const settings = readFileSync(join(copy, 'settings.tsx'), 'utf8');

    rmSync(join(copy, 'settings.tsx'));

    writeFileSync(
      join(copy, '(home)/settings.tsx'),
      settings.replace("{ presentation: 'sheet' }", "{ title: 'Settings' }"),
    );

    await router.patch(copy);
    await router.send('to-settings.press');

    assert.equal(router.ofKind('Sheet').length, 0, 'no longer a sheet');

    assert.ok(
      router.ofKind('NavigationScreen').some((screen) => screen.props.title === 'Settings'),
    );

    assert.equal(router.textOf('settings'), 'settings');
  } finally {
    rmSync(dirname(copy), { recursive: true, force: true });
  }
});

// --- Route modules: each route file is a chunk, evaluated on first navigation ---

const LAZY = 'test/fixtures/file-router-lazy-app';

/** The route modules the app has run, in order. */
const evaluatedRoutes = (router: Awaited<ReturnType<typeof app>>) => [
  ...((router.kernel as { routeModules?: string[] }).routeModules ?? []),
];

test('a cold start evaluates the root and the first screen’s route module only', async () => {
  const router = await app(LAZY);

  assert.deepEqual(evaluatedRoutes(router), ['index']);
  assert.deepEqual(titles(router), ['Home'], 'the library tab mounts no screen yet');
});

test('a route module evaluates on first navigation, once', async () => {
  const router = await app(LAZY);

  await router.send('to-show.press');
  assert.equal(router.textOf('show-id'), 'show 42');
  assert.deepEqual(evaluatedRoutes(router), ['index', 'show']);

  await router.send('show-back.press');
  await router.send('to-show.press');
  assert.deepEqual(evaluatedRoutes(router), ['index', 'show']);
});

test('a tab’s screens mount, and its route module runs, when the tab is first selected', async () => {
  const router = await app(LAZY);
  const [tabs] = router.ofKind('NavigationTabs');

  await router.send(tabs.id + '.select\u001f' + JSON.stringify({ index: 1 }));

  assert.equal(router.textOf('library'), 'library');
  assert.deepEqual(titles(router), ['Home', 'Library']);
  assert.deepEqual(evaluatedRoutes(router), ['index', 'library']);
});

test('a sheet route opens as a sheet before its module has run', async () => {
  const router = await app(LAZY);

  await router.send('to-settings.press');

  assert.equal(router.ofKind('Sheet').length, 1);
  assert.equal(router.textOf('settings'), 'settings');
  assert.deepEqual(evaluatedRoutes(router), ['index', 'settings']);
});

test('a release build starts with the root alone and loads each chunk from the host', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-router-'));

  try {
    const compiled = await createSourceCompiler({ platform: 'ios', outputDir: temp })(
      resolve(LAZY),
    );
    const names = compiled.chunks.map((chunk) => chunk.name);

    assert.ok(names.includes('app'));

    for (const route of ['index', 'show', 'library', 'settings'])
      assert.ok(names.includes('route-' + route), 'a chunk for routes.' + route);

    const loads: string[] = [];
    const kernel = installKernel(
      hosting({
        createView() {},
        setProp() {},
        removeView() {},
        moveView() {},
        __kuitoHostLoad(name: string) {
          loads.push(name);

          const chunk = compiled.chunks.find((each) => each.name === name);

          if (chunk) runInNewContext(chunk.code, kernel);
        },
      }),
    );

    runInNewContext(compiled.start, kernel);
    await new Promise<void>((done) => setTimeout(done, 0));

    assert.deepEqual([...((kernel as { routeModules?: string[] }).routeModules ?? [])], ['index']);
    assert.ok(loads.includes('route-index'));
    assert.ok(!loads.some((name) => /^route-(show|library|settings)$/.test(name)));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('a Live Patch of a route module applies in place', async () => {
  mkdirSync('dist', { recursive: true });

  const copy = join(mkdtempSync(resolve('dist/kuito-routes-')), 'app');

  try {
    cpSync(resolve(LAZY), copy, { recursive: true });

    const router = await app(copy);

    await router.send('to-show.press');

    const show = router
      .ofKind('NavigationScreen')
      .find((screen) => screen.props.title === 'Show 42');
    const file = join(copy, '(home)/show/[id].tsx');

    writeFileSync(file, readFileSync(file, 'utf8').replace('{`show ${id}`}', '{`episode ${id}`}'));
    await router.patch(copy);

    assert.equal(router.textOf('show-id'), 'episode 42');
    assert.ok(show);
    assert.equal(router.views.get(show.id)?.kind, 'NavigationScreen', 'the screen stayed');
  } finally {
    rmSync(dirname(copy), { recursive: true, force: true });
  }
});

// --- Live Patch of a Router's table ----------------------------------------

/**
 * One app file the tests edit: a Live Patch recompiles the same file, and
 * component identities include its path. Inside the repository, so the app
 * resolves kuito as a fixture does.
 */
function appFile(fixture: string) {
  const temp = mkdtempSync(resolve('test/fixtures/.router-'));
  const file = join(temp, 'app.tsx');

  onTestFinished(() => rmSync(temp, { recursive: true, force: true }));
  writeFileSync(file, readFileSync(fixture));

  return file;
}

/** Saves `fixture` over the app file, then patches the app with it. */
async function edit(router: Awaited<ReturnType<typeof app>>, file: string, fixture: string) {
  writeFileSync(file, readFileSync(fixture));
  await router.patch(file);
}

const titles = (router: Awaited<ReturnType<typeof app>>) =>
  router
    .ofKind('NavigationScreen')
    .map((screen) => String(screen.props.title))
    .sort((a, b) => a.localeCompare(b));

test('Live Patch applies an edited route table; the stacks stay', async () => {
  const file = appFile('test/fixtures/router-app.tsx');
  const router = await app(file);

  await router.send('home-visit.press');
  await router.send('to-show.press');

  const show = router.ofKind('NavigationScreen').find((screen) => screen.props.title === 'Show 42');

  assert.ok(show);

  await edit(router, file, 'test/fixtures/router-app-edited.tsx');

  assert.deepEqual(
    router.ofKind('NavigationTab').map((tab) => [tab.props.title, tab.props.icon ?? null]),
    [
      ['Start', 'star'],
      ['Library', { uri: 'https://example.com/shelf.png' }],
    ],
  );

  assert.deepEqual(titles(router), ['Episode 42', 'Home']);
  assert.equal(router.views.get(show.id)?.kind, 'NavigationScreen', 'the pushed screen stayed');
  assert.equal(router.textOf('home-visits'), '1 visits', 'Home kept its state');
  assert.equal(router.ofKind('NavigationTabs')[0].props.selectedIndex, 0);
});

test('a patch that removes a route the stack shows closes that screen', async () => {
  const file = appFile('test/fixtures/router-app.tsx');
  const router = await app(file);

  await router.send('home-visit.press');
  await router.send('to-show.press');
  await edit(router, file, 'test/fixtures/router-app-no-show.tsx');

  assert.deepEqual(titles(router), ['Home']);
  assert.equal(router.textOf('home-visits'), '1 visits', 'Home kept its state');
});

test('navigate still works after a Live Patch that leaves the Router as it was', async () => {
  const file = appFile('test/fixtures/router-patch-app.tsx');
  const router = await app(file);

  await router.patch(file);

  const kernel = router.kernel as unknown as { navigate(to: object): void };

  kernel.navigate({ route: 'about', params: {} });
  await router.settle();

  assert.deepEqual(titles(router), ['About', 'Home']);
});

test('opening a sheet over a screen leaves the screen as it rendered', async () => {
  const router = await app('test/fixtures/router-results-app.tsx');
  const renders = () => (router.kernel as { homeRenders?: number }).homeRenders;
  const before = renders();

  await router.send('pick.press');
  await router.send('choose.press');

  assert.equal(renders(), before, 'Home rendered once, before');
});

test('a patch to a constant a tab reads updates the tab', async () => {
  const file = appFile('test/fixtures/router-app.tsx');
  const router = await app(file);

  await edit(router, file, 'test/fixtures/router-app-icon.tsx');

  const library = router.ofKind('NavigationTab').find((tab) => tab.props.title === 'Library');

  assert.deepEqual(library?.props.icon, { uri: 'https://example.com/shelf.png' });
});
