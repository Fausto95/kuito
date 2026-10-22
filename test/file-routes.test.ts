import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  fileRoutes,
  readLayout,
  readRoute,
  routeSource,
  routeTypes,
  type RouteDeclarations,
} from '../src/dev/file-routes.ts';

const paths = (routes: ReadonlyArray<{ file: string; path: string }>) =>
  routes.map(({ file, path }) => [file, path]);

test('file names become paths: index, [param], [...rest] and (groups)', () => {
  const tree = fileRoutes(
    [
      'index.tsx',
      'show/[id].tsx',
      'show/[id]/cast.tsx',
      'files/[...rest].tsx',
      '(account)/profile.tsx',
      'about/index.jsx',
    ],
    null,
  );

  assert.deepEqual(tree.tabs, []);

  assert.deepEqual(paths(tree.routes), [
    ['index.tsx', '/'],
    ['about/index.jsx', '/about'],
    ['(account)/profile.tsx', '/profile'],
    ['show/[id].tsx', '/show/:id'],
    ['show/[id]/cast.tsx', '/show/:id/cast'],
    ['files/[...rest].tsx', '/files/*rest'],
  ]);
});

test('a route is named for its static segments, camelCased; the root is index', () => {
  const tree = fileRoutes(
    [
      'index.tsx',
      'about/index.tsx',
      '(account)/profile.tsx',
      'show/[id].tsx',
      'show/[id]/cast.tsx',
      'files/[...rest].tsx',
      'my-list/top_rated.tsx',
    ],
    null,
  );

  assert.deepEqual(
    tree.routes.map((route) => [route.name, route.path]),
    [
      ['index', '/'],
      ['about', '/about'],
      ['profile', '/profile'],
      ['myListTopRated', '/my-list/top_rated'],
      ['show', '/show/:id'],
      ['showCast', '/show/:id/cast'],
      ['files', '/files/*rest'],
    ],
  );
});

test('two routes with one name are an error, until one declares its own', () => {
  assert.throws(
    () => fileRoutes(['show.tsx', 'show/[id].tsx'], null),
    /show\.tsx and show\/\[id\]\.tsx are both routes\.show: give one its own name with export const name = '…'/,
  );

  const named = (file: string): RouteDeclarations =>
    file === 'show.tsx' ? { name: 'shows', params: null, result: false, presentation: null } : NONE;
  const tree = fileRoutes(['show.tsx', 'show/[id].tsx'], null, named);

  assert.deepEqual(
    tree.routes.map((route) => [route.name, route.path]),
    [
      ['shows', '/show'],
      ['show', '/show/:id'],
    ],
  );
});

const NONE: RouteDeclarations = { name: null, params: null, result: false, presentation: null };

test('a route’s params: its path’s, as strings, or the kinds its Params type gives', () => {
  const declared = (file: string): RouteDeclarations =>
    file === 'show/[id].tsx'
      ? {
          name: null,
          params: {
            id: { kind: 'number', optional: false },
            tab: { kind: 'string', optional: true },
          },
          result: true,
          presentation: null,
        }
      : NONE;
  const tree = fileRoutes(['show/[id].tsx', 'files/[...rest].tsx', 'index.tsx'], null, declared);

  assert.deepEqual(
    tree.routes.map((route) => [route.name, route.params, route.result]),
    [
      ['index', {}, false],
      [
        'show',
        { id: { kind: 'number', optional: false }, tab: { kind: 'string', optional: true } },
        true,
      ],
      ['files', { rest: { kind: 'string', optional: false } }, false],
    ],
  );

  const params = (value: RouteDeclarations['params']) => () =>
    fileRoutes(['show/[id].tsx'], null, () => ({
      name: null,
      params: value,
      result: false,
      presentation: null,
    }));

  assert.throws(
    params({ tab: { kind: 'string', optional: false } }),
    /show\/\[id\]\.tsx: Params has no id, which the file's name gives the path/,
  );

  assert.throws(
    params({ id: { kind: 'number', optional: true } }),
    /show\/\[id\]\.tsx: Params\.id is in the path, so it cannot be optional/,
  );

  assert.throws(
    params({
      id: { kind: 'string', optional: false },
      dismiss: { kind: 'string', optional: false },
    }),
    /show\/\[id\]\.tsx: a param cannot be named dismiss: the screen's dismiss prop has the name/,
  );
});

test('a route file declares Params, Result and its name as the compiler reads them', () => {
  assert.deepEqual(
    readRoute(
      `export type Params = { id: number; tab?: string; 'exact': boolean };
export interface Result { color: string }
export const name = 'details';
export default function Show() { return null; }`,
      '/app/show/[id].tsx',
    ),
    {
      name: 'details',
      params: {
        id: { kind: 'number', optional: false },
        tab: { kind: 'string', optional: true },
        exact: { kind: 'boolean', optional: false },
      },
      result: true,
      presentation: null,
    },
  );

  assert.deepEqual(
    readRoute(
      `export interface Params { readonly list: string }
export type Result = 'red' | 'blue';`,
      '/app/[list].tsx',
    ),
    {
      name: null,
      params: { list: { kind: 'string', optional: false } },
      result: true,
      presentation: null,
    },
  );

  assert.deepEqual(readRoute('export default function Home() {}', '/app/index.tsx'), NONE);

  const at = (line: number, column: number) => ({ file: '/app/x.tsx', line, column });

  assert.throws(() => readRoute('export type Params = { at: Date };', '/app/x.tsx'), {
    message: /^Params\.at must be string, number or boolean: a deep link carries it as text/,
    loc: at(1, 28),
  });

  assert.throws(
    () => readRoute('export type Params = Record<string, string>;', '/app/x.tsx'),
    /Params must be a type literal, like \{ id: number \}/,
  );

  assert.throws(
    () => readRoute('const n = "x";\nexport const name = n;', '/app/x.tsx'),
    /name must be a string literal/,
  );

  assert.throws(
    () => readRoute("export const name = 'two words';", '/app/x.tsx'),
    /name must be an identifier, like 'shows'/,
  );
});

test('private files, layouts and non-component files are not routes', () => {
  const tree = fileRoutes(
    ['index.tsx', '_layout.tsx', '_components/Card.tsx', 'show/_row.tsx', 'styles.css', 'data.ts'],
    null,
  );

  assert.deepEqual(paths(tree.routes), [['index.tsx', '/']]);
});

test('routes are ordered so the first match is the most specific', () => {
  const tree = fileRoutes(
    ['show/[id].tsx', 'show/new.tsx', '[...rest].tsx', 'show/[id]/[tab].tsx', 'index.tsx'],
    null,
    (file) => (file === 'show/[id]/[tab].tsx' ? { ...NONE, name: 'showTab' } : NONE),
  );

  assert.deepEqual(
    tree.routes.map((route) => route.path),
    ['/', '/show/new', '/show/:id', '/show/:id/:tab', '/*rest'],
    'static before dynamic before catch-all; a stack’s root (shallowest) first',
  );
});

test('top-level groups become the tabs _layout declares, in its order', () => {
  const tree = fileRoutes(
    [
      '(library)/library.tsx',
      '(home)/index.tsx',
      '(home)/show/[id].tsx',
      'settings.tsx',
      '(home)/(modals)/compose.tsx',
    ],
    [
      { name: 'home', title: 'Home', icon: 'home' },
      { name: 'library', title: 'Library' },
    ],
  );

  assert.deepEqual(
    tree.tabs.map((tab) => ({ ...tab, routes: paths(tab.routes) })),
    [
      {
        name: 'home',
        title: 'Home',
        icon: 'home',
        routes: [
          ['(home)/index.tsx', '/'],
          ['(home)/(modals)/compose.tsx', '/compose'],
          ['(home)/show/[id].tsx', '/show/:id'],
        ],
      },
      { name: 'library', title: 'Library', routes: [['(library)/library.tsx', '/library']] },
    ],
  );

  assert.deepEqual(paths(tree.routes), [['settings.tsx', '/settings']]);
});

test('a layout and its groups must agree on the tabs', () => {
  assert.throws(
    () => fileRoutes(['(home)/index.tsx', '(extra)/x.tsx'], [{ name: 'home', title: 'Home' }]),
    /app\/\(extra\) is a top-level group, but _layout\.tsx declares no "extra" tab/,
  );

  assert.throws(
    () =>
      fileRoutes(
        ['(home)/index.tsx'],
        [
          { name: 'home', title: 'Home' },
          { name: 'library', title: 'Library' },
        ],
      ),
    /tab "library" has no routes: add app\/\(library\)\/index\.tsx/,
  );
});

test('ambiguous or malformed files are errors naming them', () => {
  assert.throws(
    () => fileRoutes(['about.tsx', 'about/index.tsx'], null),
    /about\.tsx and about\/index\.tsx both route \/about/,
  );

  assert.throws(
    () => fileRoutes(['(a)/x.tsx', 'x.tsx'], null),
    /\(a\)\/x\.tsx and x\.tsx both route \/x/,
  );

  assert.throws(
    () => fileRoutes(['[...rest]/x.tsx'], null),
    /\[\.\.\.rest\]\/x\.tsx: a catch-all \[\.\.\.name\] must be the last segment/,
  );

  assert.throws(
    () => fileRoutes(['show-[id].tsx'], null),
    /show-\[id\]\.tsx: a \[parameter\] must be a whole segment/,
  );

  assert.throws(() => fileRoutes(['_layout.tsx', 'styles.css'], null), /app has no route files/);
});

test('_layout.tsx declares tabs as a literal the compiler reads', () => {
  const at = (line: number, column: number) => ({ file: '/app/_layout.tsx', line, column });

  assert.deepEqual(
    readLayout(
      `import type { X } from 'y';
export const tabs = [
  { name: 'home', title: 'Home', icon: 'home' },
  { name: "library", title: \`Library\` },
] as const;`,
      '/app/_layout.tsx',
    ),
    {
      tabs: [
        { name: 'home', title: 'Home', icon: 'home' },
        { name: 'library', title: 'Library' },
      ],
      linking: false,
    },
  );

  assert.throws(() => readLayout(`export const tabs = TABS;`, '/app/_layout.tsx'), {
    message: /^tabs must be an array literal/,
    loc: at(1, 21),
  });

  assert.throws(
    () =>
      readLayout(
        `export const tabs = [\n  { name: 'home', title: label },\n];`,
        '/app/_layout.tsx',
      ),
    { message: /^a tab's title must be a string literal/, loc: at(2, 26) },
  );

  assert.throws(() => readLayout(`export const tabs = [{ title: 'Home' }];`, '/app/_layout.tsx'), {
    message: /^a tab needs a name/,
    loc: at(1, 22),
  });

  assert.throws(
    () =>
      readLayout(
        `export const tabs = [{ name: 'a', title: 'A', badge: '1' }];`,
        '/app/_layout.tsx',
      ),
    { message: /^a tab takes name, title and icon, not badge/, loc: at(1, 47) },
  );

  assert.throws(
    () => readLayout(`export const other = 1;`, '/app/_layout.tsx'),
    /\/app\/_layout\.tsx must export tabs or linking/,
  );
});

test('a tab icon in _layout is a name, per-platform names or an image', () => {
  assert.deepEqual(
    readLayout(
      `export const tabs = [
  { name: 'a', title: 'A', icon: { ios: 'house', android: 'home' } },
  { name: 'b', title: 'B', icon: { uri: 'https://example.com/b.png' } },
];`,
      '/app/_layout.tsx',
    ),
    {
      tabs: [
        { name: 'a', title: 'A', icon: { ios: 'house', android: 'home' } },
        { name: 'b', title: 'B', icon: { uri: 'https://example.com/b.png' } },
      ],
      linking: false,
    },
  );

  assert.throws(
    () =>
      readLayout(
        `export const tabs = [{ name: 'a', title: 'A', icon: { web: 'x' } }];`,
        '/app/_layout.tsx',
      ),
    {
      message: /^a tab icon takes ios, android or uri, not web/,
      loc: { file: '/app/_layout.tsx', line: 1, column: 55 },
    },
  );

  assert.match(
    routeSource(
      fileRoutes(
        ['(a)/index.tsx'],
        [{ name: 'a', title: 'A', icon: { ios: 'house', android: 'home' } }],
      ),
      { ui: '/ui.ts' },
    ),
    /<Tab name="a" title="A" icon=\{\{"ios":"house","android":"home"\}\}>/,
  );
});

test('_layout.tsx turns deep links on with a literal linking export', () => {
  assert.deepEqual(readLayout(`export const linking = true;`, '/app/_layout.tsx'), {
    tabs: null,
    linking: true,
  });

  assert.deepEqual(
    readLayout(
      `export const linking = false;\nexport const tabs = [{ name: 'a', title: 'A' }];`,
      '/app/_layout.tsx',
    ),
    { tabs: [{ name: 'a', title: 'A' }], linking: false },
  );

  assert.throws(() => readLayout(`export const linking = DEV;`, '/app/_layout.tsx'), {
    message: /^linking must be true or false/,
    loc: { file: '/app/_layout.tsx', line: 1, column: 24 },
  });

  assert.match(
    routeSource(fileRoutes(['index.tsx'], null), { ui: '/ui.ts', linking: true }),
    /\n {4}<Router linking>\n/,
  );
});

test('a route file’s presentation is read from its options, before its module runs', () => {
  assert.equal(
    readRoute(
      "export const options: RouteOptions = { title: 'Settings', presentation: 'sheet' };",
      '/app/settings.tsx',
    ).presentation,
    'sheet',
  );

  for (const presentation of ['modal', 'fullScreen'])
    assert.equal(
      readRoute(`export const options = { presentation: '${presentation}' };`, '/app/x.tsx')
        .presentation,
      presentation,
    );

  assert.equal(
    readRoute("export const options = { title: 'About' } satisfies RouteOptions;", '/app/a.tsx')
      .presentation,
    null,
  );

  assert.throws(() => readRoute('export const options = { presentation: kind };', '/app/x.tsx'), {
    message: /^presentation must be 'push', 'sheet', 'modal' or 'fullScreen', as a literal/,
    loc: { file: '/app/x.tsx', line: 1, column: 40 },
  });

  assert.throws(
    () => readRoute('export const options = makeOptions();', '/app/x.tsx'),
    /options must be an object literal: the compiler reads its presentation/,
  );
});

test('the generated module is the JSX route tree', () => {
  const tree = fileRoutes(
    ['(home)/index.tsx', '(home)/show/[id].tsx', 'settings.tsx'],
    [{ name: 'home', title: 'Home', icon: 'home' }],
    (file) =>
      file === '(home)/show/[id].tsx'
        ? {
            name: null,
            params: { id: { kind: 'number', optional: false } },
            result: false,
            presentation: null,
          }
        : file === 'settings.tsx'
          ? { ...NONE, presentation: 'sheet' }
          : NONE,
  );

  assert.equal(
    routeSource(tree, { ui: '/kuito/src/ui/index.ts' }),
    `import { Route, Router, Tab, Tabs } from "/kuito/src/ui/index.ts";

// Each route's module is a chunk of its own, evaluated the first time the route shows.
const load = (chunk) => () => globalThis.__kuito.requireChunk(chunk);

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="home" title="Home" icon="home">
          <Route name="index" path="/" load={load("route-index")} />
          <Route name="show" path="/show/:id" params={{ id: Number }} load={load("route-show")} />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" presentation="sheet" load={load("route-settings")} />
    </Router>
  );
}
`,
  );

  assert.match(
    routeSource(fileRoutes(['index.tsx'], null), { ui: '/ui.ts' }),
    /<Router>\n {6}<Route name="index" path="\/" load=\{load\("route-index"\)\} \/>\n {4}<\/Router>/,
    'without tabs, routes sit directly in the Router',
  );
});

test('the generated types give each route its params and result', () => {
  const declared: Record<string, RouteDeclarations> = {
    'show/[id].tsx': {
      name: null,
      params: { id: { kind: 'number', optional: false } },
      result: false,
      presentation: null,
    },
    'picker.tsx': { name: null, params: null, result: true, presentation: null },
  };
  const tree = fileRoutes(
    ['index.tsx', 'show/[id].tsx', 'files/[...rest].tsx', 'picker.tsx', 'about.jsx'],
    null,
    (file) => declared[file] ?? NONE,
  );

  assert.equal(
    routeTypes(tree, { ui: 'kuito' }),
    `// Generated by Kuito from this directory's route files (docs/navigation.md). Do not edit.
import type { RouteTo } from "kuito";

declare module "kuito" {
  interface Routes {
    "index": RouteTo<{}>;
    "about": RouteTo<{}>;
    "picker": RouteTo<{}, import("./picker").Result>;
    "show": RouteTo<import("./show/[id]").Params>;
    "files": RouteTo<{ "rest": string }>;
  }
}
`,
  );
});
