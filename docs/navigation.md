# Navigation

Routes are typed values, shown in native stacks and tab bars: UIKit's
`UINavigationController` and `UITabBarController` on iOS, a native stack with
predictive back and Material's bottom navigation on Android. Going back follows
the platform: the edge swipe on iOS, the back gesture and button on Android.

An app is a directory of route files; the compiler turns them into the route
table and into `routes`, one typed function per route:

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }, …]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  (library)/library.tsx      routes.library()          /library, the "library" tab
  rate.tsx                   routes.rate({ show })     /rate, a sheet
  routes.generated.d.ts      the types of routes, written by the compiler
```

```tsx
// app/(shows)/show/[id].tsx
import {
  Link,
  Pressable,
  Text,
  present,
  routes,
  signal,
  type RouteOptions,
  type ScreenProps,
} from 'kuito';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function Show({ id }: ScreenProps<Params>) {
  const stars = signal<number | undefined>(undefined);

  return (
    <>
      <Link to={routes.show({ id: id + 1 })}>Next show</Link>
      <Pressable onPress={async () => (stars.value = await present(routes.rate({ show: id })))}>
        <Text>{stars.value === undefined ? 'Rate it' : `${stars.value} stars`}</Text>
      </Pressable>
    </>
  );
}
```

`routes.show({ id: '42' })` is a type error, as is a route that does not
exist. Only a deep link is a URL: [deep links](#deep-links) map one onto a
route.

## Route files

`kuito dev ios --entry app` runs an app directory (a `kuito create` app is
one). Every `.tsx` or `.jsx` file in it is a route, unless its name or a
directory above it starts with `_` or `.` (put helpers there; `.ts`, `.css`
and other files are never routes either).

- The default export is the screen. It gets the route's params as props, and
  `dismiss` ([results](#screen-results)).
- `export const options: RouteOptions<Params>` gives the rest: `title` (a
  string, or a function of the params), `header` ([headers](#headers)), `presentation`
  (`'push'`, the default, `'sheet'`, `'modal'` or `'fullScreen'`:
  [presentations](#presentations)), `backgroundColor` (the whole
  screen's, under the bars too: the content is inset from the safe area, as
  UIKit and Android inset it), `snapPoints` (a sheet route's
  heights, as [`<Sheet snapPoints>`](primitives.md) takes them) and
  `systemBars`, a `<SystemBars>`'s
  props applied while the screen is focused
  ([SystemBars](system-ui.md#per-screen)).
- The file's path is the route's deep-link path: `index` names its
  directory's path, `[name]` is a `:name` param and `[...name]` a final
  catch-all, matched into `name`. A bracket must be the whole name. `(name)`
  directories group files without adding a segment.
- `_layout.tsx` declares the tab bar: `export const tabs`, an array of
  `{ name, title, icon }`, with `icon` as `<Tab>` takes it (a name,
  `{ ios, android }` or `{ uri }`). Each top-level `(name)` group is the tab of
  that name, in the array's order, and every top-level group must be one. Files
  outside the groups go in no tab: presented routes, beside the tab bar. Without `tabs`,
  the app is one stack and groups only organize files. `export const linking =
  true` turns on [deep links](#deep-links). The compiler reads both without
  running the file, so each is a literal, and a `_layout.tsx` may export
  either alone.
- Routes are ordered so the first match is the most specific and a stack's
  shallowest route is its first screen: catch-alls last, then fewer segments,
  then static segments before params.

Two files with the same path or the same name, a tab without routes, a group
without a tab, and a `_layout.tsx` or a declaration the compiler cannot read
are compile errors naming the file.

## The route table

`routes` has one function per route, named for the route's static segments
in camelCase: `index` for `/`, `show` for `show/[id].tsx`, `showCast` for
`show/[id]/cast.tsx`, `myList` for `my-list.tsx`. A path of params alone is
named for them (`[...rest].tsx` is `rest`). Called with the route's params,
it returns a `Destination`, the value `navigate`, `present` and `<Link to>`
take; a route without params takes none.

```tsx
export const name = 'shows'; // in show.tsx, which show/[id].tsx would also name routes.show
```

Two routes that would share a name are a compile error until one declares its
own with `export const name`, an identifier string literal.

A route's params are its path's, as strings, unless the file declares their
types:

```tsx
export type Params = { id: number; tab?: string };
```

`Params` is a type literal (or an interface) of `string`, `number` and
`boolean` members: a deep link carries each as text, so each must parse from
it. It has every param the path names, none of them optional; the others come
from a deep link's query string. A param cannot be named `dismiss`.

The compiler writes the table's types to `routes.generated.d.ts` in the app
directory each time it builds, and `kuito create` ships it, so an editor and
`tsc` check every route before the app runs. It augments `Routes`, the
interface `routes` is typed by; commit it with the routes. For the tree
above, with each `Params` and `Result` written inline rather than imported
from its route file, it amounts to:

```ts
import type { RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo<{}>;
    show: RouteTo<{ id: number }>;
    library: RouteTo<{}>;
    rate: RouteTo<{ show: number }, number>;
  }
}
```

## Route modules

Each route file compiles to a module of its own (a chunk, with what the route
files share split into chunks beside them), and a route's module runs the
first time the route shows. A cold start evaluates the kernel, the root (the
route table) and the first screen's module, nothing else; a tab mounts its
screens, and runs their modules, when it is first selected.

- The compiler reads a route's `presentation` from its `options` without
  running the module, since it decides where the route shows before the
  module loads: it is a `'push'`, `'sheet'`, `'modal'` or `'fullScreen'`
  literal, in an `options` object literal.
- A release build compiles each chunk to Hermes bytecode on its own, beside
  `app.hbc`: `Modules/` in the iOS bundle, `assets/kuito/modules/` in the
  APK. The first require of a chunk evaluates its file inside the job that
  required it, so navigating stays synchronous, and traces it as
  `Kuito evaluate kuito://modules/<chunk>`.
- A Live Patch sends every chunk of the revision in one script, which defines
  them and runs the root again; each route's module runs again when its
  screen re-renders, so a patched route file applies in place.

## Moving between routes

- `navigate(routes.show({ id }))`: shows the destination. A route in another
  tab selects that tab; a tab's first route pops that tab to it; any other
  route is pushed on its stack, unless it is already on top with the same
  params. A presented route (a sheet, modal or full-screen one) is presented
  over everything.
- `navigate(to, { replace: true })`: replaces the top screen instead.
- `present(to)`: shows the destination as a new screen, always (pushed on its
  stack, or presented), and resolves with its [result](#screen-results).
- `goBack()`: closes the top presented screen, or pops the current stack. On the first
  screen of a stack it does nothing (Android's back then leaves the app).
- `<Link to replace>`: a pressable that navigates.

A screen stays mounted, with its state, while screens are pushed above it, and
in a tab while you switch tabs. Popping a screen unmounts it. A tab mounts its
screens when it is first selected.

A destination whose route the table lacks, or whose params do not fit it (a
path param missing, a value of the wrong kind), is an error naming the route.

## Presentations

A route's `presentation` says where it shows. `'push'` puts it on its tab's
stack; the other three present it over everything, tab bar included, until it
closes:

| `presentation` | iOS                                                                              | Android                                         |
| -------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `'sheet'`      | A sheet at its `snapPoints`, swiped down to close                                | Material's bottom sheet at its `snapPoints`     |
| `'modal'`      | A page sheet at full height, the app scaled back behind it; swiped down to close | A full-screen dialog sliding up; back closes it |
| `'fullScreen'` | A cover of the whole screen; only the app closes it                              | The same full-screen dialog; back closes it     |

A sheet shows its screen's content alone. A modal or full-screen route shows
its screen in a native stack of its own, so it has the header a pushed screen
has, with its `title`. On iOS nothing but the app closes a full-screen route:
give it a way out (a button that calls `dismiss` or `goBack()`). Presented
routes stack: one presented from another shows over it, and `goBack()` closes
the top one.

A presented route's `systemBars` apply while it is focused, as a pushed
screen's do, with one gap: on Android a modal or full-screen route's dialog has
bars of its own, transparent over its content, whose icons follow the light or
dark theme rather than `systemBars`.

## Headers

A screen's native header shows its `title`, a back button when there is a
screen to go back to, and what its route's `header` adds: buttons on either
side, a large title and a search field. `header: false` hides it.

```tsx
// app/(shows)/index.tsx
import { For, Text, VStack, signal, type RouteOptions } from 'kuito';

const editing = signal(false);
const query = signal('');
const shows = signal<string[]>([]);

function add() {
  shows.value = [...shows.value, `Show ${shows.value.length + 1}`];
}

export const options: RouteOptions = {
  title: 'Shows',
  header: {
    leading: [{ label: 'Edit', onPress: () => (editing.value = !editing.value) }],
    trailing: [{ label: 'Add', icon: { ios: 'plus', android: 'add' }, onPress: add }],
    largeTitle: true,
    search: { placeholder: 'Shows', onChange: (text) => (query.value = text) },
  },
};

export default function Shows() {
  return (
    <VStack>
      <For each={shows.value.filter((show) => show.includes(query.value))}>
        {(show) => <Text>{editing.value ? `Delete ${show}` : show}</Text>}
      </For>
    </VStack>
  );
}
```

- `leading` and `trailing`: buttons before and after the title, in reading
  order, so they swap sides in right-to-left. Each has a `label`, an `onPress`,
  and may be `disabled`. An `icon` shows instead of the label, which a screen
  reader still reads: a symbol name, or `{ ios, android }` names, as a tab's
  icon takes them ([icons](#icons)), without `{ uri }`. A name the platform
  lacks is an error.
- `largeTitle`: the title shown large under the bar.
- `search`: a search field. `onChange` gets the text as the user types it,
  `onSubmit` the text when they press the search key; `placeholder` shows while
  it is empty.
- `header` can be a function of the params, as `title` can:
  `header: ({ id }) => ({ trailing: [{ label: 'Rate', onPress: () => rate(id) }] })`.
  It runs again when a signal it reads changes, so an item can follow state:
  `disabled: !valid.value`.
- A key the header, an item or the search does not take is an error, as is a
  value of the wrong type.

The platforms draw these their own way:

| Header       | iOS                                                          | Android                                                                                |
| ------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `leading`    | Bar buttons after the back button                            | The first actions at the end of the bar: Material's only leading place is the up arrow |
| `trailing`   | Bar buttons at the trailing edge, the first one outermost    | Actions at the end of the bar, after the leading ones                                  |
| `largeTitle` | UIKit's large title                                          | Material 3's large top app bar: the title in headline type under the bar               |
| `search`     | A search controller under the title, shown without scrolling | A search action at the end that expands into a field over the bar; back closes it      |

Kuito ties no scroll view to the bar: on Android a large title stays as the
screen scrolls, and on iOS UIKit shrinks it into the bar only if it finds the
screen's scroll view itself.

## Screen results

A screen can answer the screen that showed it. `present` resolves with the
result the presented screen passes to its `dismiss` prop, which also closes
it; it resolves `undefined` when the screen goes any other way: the user swipes
it away or goes back, `goBack`, a `navigate` that replaces or pops it, or a
Live Patch that removes its route.

```tsx
// app/rate.tsx
import { Pressable, Text, present, routes, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { show: number };
export type Result = number;

export const options: RouteOptions<Params> = { presentation: 'sheet' };

export default function Rate({ show, dismiss }: ScreenProps<Params, Result>) {
  return (
    <Pressable onPress={() => dismiss(5)}>
      <Text>Five stars for show {show}</Text>
    </Pressable>
  );
}

// anywhere
const stars = await present(routes.rate({ show: 42 })); // number | undefined
```

The file's `Result` type is the result's: `present(routes.rate({ show }))` is a
`Promise<number | undefined>`. The kernel keeps the pending promise with the
navigation state, across the push, the pop and any Live Patch between them.

## Motion

A screen's props carry two motion values from the platform, which move every
frame on the UI thread with no JavaScript ([motion sources](motion.md#motion-sources)):

- `back`: how far a back swipe has taken its stack's top screen away, 0 at
  rest and 1 once it has gone. Every screen of the stack reads the same value,
  so the top screen can fade as it leaves and the one below can come forward.
  It stays 0 for a presented screen; a screen rendered outside a Router (in a
  test) has none.
- `sheet`: for a route presented as a sheet, the sheet's `SheetMotion`: its
  `height` on screen and its `progress` between its lowest and highest snap
  points.

```tsx
import { Image, interpolate, type ScreenProps } from 'kuito';

export default function Details({ back, sheet }: ScreenProps) {
  return (
    <Image
      src="https://example.com/poster.jpg"
      scale={back ? interpolate(back, [0, 1], [1, 0.9]) : 1}
      opacity={sheet ? interpolate(sheet.progress, [0, 1], [0.6, 1]) : 1}
    />
  );
}
```

`interpolate` and `clamp` take them as they are; a `map` callback on a screen
prop is not one the compiler sees as a motion value's, so it runs on the JS
thread. iOS reads the pop from the outgoing screen's position on each display
frame of the transition, the edge swipe included, so a back button's pop moves
it too; Android reports its predictive back gesture, 1 when the swipe commits
and 0 once the pop is done or the gesture is cancelled, without the frames of
the animation that follows.

## Shared elements

A view with a `sharedId` flies to the view with the same `sharedId` on the
screen a stack pushes or pops to: a poster in a list grows into the details
screen's header image, and shrinks back when you go back.

```tsx
// app/(shows)/index.tsx
import { Image, Link, List, routes } from 'kuito';

const shows = [{ id: 42, poster: 'https://example.com/posters/42.jpg' }];

export default function Shows() {
  return (
    <List
      data={shows}
      renderItem={({ item: show }) => (
        <Link to={routes.show({ id: show.id })}>
          <Image sharedId={`poster-${show.id}`} src={show.poster} width={80} height={120} />
        </Link>
      )}
    />
  );
}
```

```tsx
// app/(shows)/show/[id].tsx
import { Image, type ScreenProps } from 'kuito';

export type Params = { id: number };

export default function Show({ id }: ScreenProps<Params>) {
  return (
    <Image
      sharedId={`poster-${id}`}
      src={`https://example.com/posters/${id}.jpg`}
      width="100%"
      aspectRatio={2 / 3}
    />
  );
}
```

- The stack snapshots the leaving view and moves the snapshot from that view's
  frame to the arriving view's, alongside the platform's own push or pop, on
  its duration and easing; both views hide while it flies.
- iOS: every animated push and pop, the interactive edge swipe included, which
  drives the flight with the finger and puts it back if the swipe is cancelled.
- Android: pushes and pops the app or the back button makes. A predictive back
  gesture moves the pages with the finger, and the pop it ends in has no
  flight.
- A `sharedId` is unique within a screen; a second view with the same one on
  that screen does not fly. Views that are on only one of the two screens do
  not fly. Sheets do not take part.

## Icons

A tab's `icon` is the platform's own symbol, by name, or any image:

- A string: an [SF Symbol](https://developer.apple.com/sf-symbols/) on iOS, a
  [Material Symbol](https://fonts.google.com/icons) on Android, as
  `icon="star"`. A literal name a platform lacks is a compile error at its
  line, as for [`<Symbol>`](assets.md#symbols).
- `{ ios, android }`: one name per platform, as most differ:
  `icon={{ ios: 'house', android: 'home' }}`. A platform left out shows no
  icon.
- `{ uri }`: any image, like `<Image src>` (https, file or data URI),
  loaded and cached like an `Image`. One that fails to load is an error naming
  its tab.

```tsx
import { Route, Router, Tab, Tabs, Text } from 'kuito';

function TopRated() {
  return <Text>Top rated</Text>;
}

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="top" title="Top rated" icon={{ uri: 'https://example.com/star.png' }}>
          <Route name="index" path="/" screen={TopRated} />
        </Tab>
      </Tabs>
    </Router>
  );
}
```

The tab bar fits each icon in a symbol's square (25 points on iOS, 24 dp on
Android) and tints it from its alpha: draw image icons as a shape on
transparency. Android draws Material Symbols from the outlined font Kuito
bundles, at regular weight.

## Routes in JSX

The compiler's table is the same `<Router>` tree an app can write by hand,
which then declares its routes' types itself:

```tsx
import {
  Link,
  Route,
  Router,
  Tab,
  Tabs,
  Text,
  routes,
  type RouteTo,
  type ScreenProps,
} from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    settings: RouteTo;
  }
}

function Discover() {
  return <Link to={routes.show({ id: 42 })}>Show 42</Link>;
}

function Show({ id }: ScreenProps<{ id: number }>) {
  return <Link to={routes.settings()}>Settings for show {id}</Link>;
}

function Settings() {
  return <Text>Settings</Text>;
}

export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="discover" title="Discover" icon={{ ios: 'safari', android: 'explore' }}>
          <Route name="index" path="/" screen={Discover} title="Discover" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={Show}
            title={({ id }) => `Show ${id}`}
          />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
```

- `<Router initial linking>`: the app's navigation. An app has one; a second
  is an error. `initial` is the first destination shown (the first route's, by
  default); `linking` follows [deep links](#deep-links).
- `<Route name path params screen title presentation backgroundColor snapPoints header systemBars>`:
  `name` is its key in `routes`; `path` is what a deep link's path matches
  (segments, `:name` params and a final `*name`); `params` says how a link's
  text parses into each param, `String` (the default), `Number` or `Boolean`;
  the rest are the [options](#route-files).
- `<Tabs>` with `<Tab name title icon>` children: a native tab bar. Each tab is
  its own stack of the routes inside it, kept while you switch tabs.
- Routes directly in `<Router>` (not presented ones) form a single stack, with no tabs.

## Deep links

A link is the one place a route is a string. `<Router linking>`, or
`export const linking = true` in `_layout.tsx`, follows the links that open
the app ([linking.md](linking.md)): the link it launched with once the Router
mounts, and each link that arrives while it runs. A link becomes the
destination of the first route whose path it matches, and is navigated to as
`navigate` would, so a route in another tab selects that tab and a presented
route is presented.

- The path follows the scheme: `kuito://show/42` and `kuito:///show/42` are
  `/show/42` (after a custom scheme, the host is the first segment), and
  `https://kuito.dev/show/42` is `/show/42` (a web link's host is the site).
- Each path param parses from its segment by its kind: `/show/42` is
  `routes.show({ id: 42 })` when `id` is a number. A segment that does not
  parse (`/show/forty`) does not match.
- Params the path does not name come from the query, parsed the same way:
  `/search?q=bear&page=2`. Query keys the route has no param for, and the
  fragment, are ignored.
- A link no route matches is a console warning naming it, and changes nothing.
- Deep links are off by default: a link can open any route, so an app turns
  them on when its routes are ready to be entry points.

The schemes and domains that open the app are its own, from `kuito.config.ts`:
`urlSchemes` and `linkDomains` ([linking.md](linking.md#the-apps-url-scheme)).

## Live Patch

A patch that edits route files, or the Router's tabs and routes, applies them
in place: stacks, presented screens, the selected tab and every mounted screen's state
stay. A tab is the same tab by `name`, a route the same route by name,
`presentation` and tab, so tabs and routes may be reordered, added, retitled
or given new paths.

- A screen whose route the patch removed (or moved to another tab) closes,
  with the screens above it in its stack, and a `present` waiting on it
  resolves `undefined`. A presented screen likewise.
- A new tab, or a stack left with no screen, starts on its first route.
- The selected tab follows its `name`; if the patch removed it, the first tab
  is selected.

## Native contract

Both renderers implement four kinds, owned by `properties/KuitoNavigationProperties`
and their views in `views/`:

- `NavigationStack`: a native stack. Its children are `NavigationScreen` views,
  bottom to top. A child added on top is pushed, animated unless it is the
  first; removing the top child pops it, animated; any other change of order
  sets the stack without animation. Each screen's subtree is laid out as a root
  of its own, in the frame the native stack gives it (below the header), and
  inherits the stack's `direction`. In `rtl` the stack mirrors: on iOS its
  controller's view and bar take the direction, so screens come in from the
  left and the edge swipe starts at the right; on Android pages slide the
  other way, and the header keeps its back arrow on the left
  ([styles](styles.md#right-to-left)).
- `NavigationScreen`: props `title` (string), `header` (boolean, default
  true), `headerItems` (`[{ label, icon, disabled, placement }]`, where
  `placement` is `leading` or `trailing` and `icon` a symbol name or
  `{ ios, android }`), `largeTitle` (boolean, default false) and `search`
  (`{ placeholder }`; unset, no search field). It emits `dismiss` when the
  platform removed it: the iOS edge swipe or back button, Android's back
  gesture, back button or header arrow. It does not emit it for a removal the
  kernel asked for. After `dismiss`, the kernel removes the view; the renderer
  treats removing an already-popped screen as done. It emits `headeritem` with
  `{ index }`, the item's index in `headerItems`, when the user presses one;
  `search` with `{ text }` when the search text changes; and `searchsubmit`
  with `{ text }` on the search key.
- `NavigationTabs`: a native tab bar. Its children are `NavigationTab` views, in
  order. Prop `selectedIndex` (number). It emits `select` with `{ index }` when
  the user picks a tab; the selection changes when the kernel sets
  `selectedIndex`.
- `NavigationTab`: props `title` (string) and `icon`: a symbol name (SF
  Symbol on iOS, Material Symbol on Android), or `{ ios, android }`,
  each renderer taking its own key, or `{ uri }`, loaded through the
  platform's image loader. It emits `error` with
  `{ error }` when an image icon fails to load. Its one child is the tab's
  `NavigationStack`.

The Router presents a route through a `Sheet` ([primitives](primitives.md)),
with the internal prop `presentation`: `sheet` (the default), `modal` or
`fullScreen`, read when the sheet opens. iOS presents a `modal` as a
`.pageSheet` with UIKit's one large detent and no grabber, and a `fullScreen`
as `.fullScreen`; Android presents both in a full-screen dialog
(`KuitoModalDialog`) whose back dispatcher a `NavigationStack` inside takes,
sliding in and out with Material's bottom sheet window animation. A
full-screen cover on iOS answers for the status bar with its presenter's
style, where the app's SystemBars apply.
Either way the sheet's content is laid out at the presentation's full size
with no inset, since the stack in it keeps its screens clear of the bars, and
`close` reports a user's dismissal as for a sheet.

On Android the topmost visible stack with more than one screen handles back
(predictive back on API 34, following the gesture's progress); otherwise back
goes to the system.

## Credits

Android draws tab icons with the [Material Symbols](https://github.com/google/material-design-icons)
outlined font, instanced at regular weight
(`native/android/app/src/main/res/font/material_symbols.ttf`): Apache License
2.0, Copyright Google LLC (`native/android/app/src/main/LICENSE-material-symbols`).
