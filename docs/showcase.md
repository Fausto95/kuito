# Reel, the demo app

`demo/app/` is Reel: a streaming catalog over the public
[TVMaze API](https://www.tvmaze.com/api) (no key needed), built to show what
Kuito does on real native views.

```sh
cd demo
kuito dev ios           # iOS Simulator, Hermes on device; macOS only
kuito dev android       # Android emulator
kuito build ios         # compile the app without launching
```

## Screens

| Screen   | What it shows                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Discover | Real `fetch`, a hero, horizontal `List` rails of cached `Image` posters, `Pressable` springs and haptics, pull-to-refresh, retry |
| Search   | `TextField` with debounced typing, a cancelling `task()`, loading, empty and failed states with `Show`/`Switch`/`Match`          |
| Library  | A vertical `List` that pages through TVMaze with `onReachEnd`, filter pills, My List                                             |
| Lab      | Signals, `spring`/`timing`, `enter`/`exit` effects , `Toggle`, clipboard and haptics, LogBox triggers                            |
| Details  | A sheet route at two snap points, loaded when the first show opens: the show's story, Save, and the cast loaded when it opens    |

Every screen stays mounted while hidden (`hidden`), so each keeps its scroll
position and state. A `SafeArea` keeps the status bar and the tab bar clear.

## Files

```text
demo/app/index.tsx           the first screen: tabs, the catalog and My List
demo/app/show/[id].tsx       the details sheet, a route of its own (docs/navigation.md#route-modules)
demo/reel/store.ts           what the two routes share: the shows listed, My List
demo/reel/api.ts             TVMaze client: shows, search, cast
demo/reel/catalog.ts         plain functions: featured show, rails, labels
demo/reel/components.tsx     Poster, RailView, ShowRow, Segments, Loading, Message
demo/reel/details.tsx        the details sheet's content
demo/reel/tab-bar.tsx        bottom tabs
demo/reel/screens/*.tsx      Discover, Search, Library, Lab
demo/reel/theme.css          the design: near-black, one warm accent, gold ratings
demo/reel/assets/            the app icon, and the staging one
demo/kuito.config.ts        Reel's name, ids, icon, permissions and environments
demo/package.json            the app's one dependency, kuito, from this checkout
```

## Config

`demo/` is an app of its own, like one `kuito create` makes ([app projects](apps.md)): its
`package.json` depends on the checkout (`file:..`; the root's `npm install` links the
checkout as `node_modules/kuito`, which `demo/` resolves from), and its `kuito.config.ts` is Reel's
([app projects](apps.md#kuitoconfigts)): its name, version, the icon in `reel/assets/`, and a staging environment
(`kuito dev ios --env staging`) with its own name, ids and striped icon. It keeps
the id `dev.kuito.shell`, and declares every permission, because the other demos run
in the same shell through `--entry`.

## Tests

`test/demo.test.ts` compiles the app with the real compiler and runs it in the
kernel against a fake TVMaze (`test/fixtures/tvmaze`): the hero and rails load,
a poster opens its details and cast, a saved show lands in My List, search
sends one request once typing pauses, and a failed load recovers on retry.

## Lists

Every list is a `List` virtualized by the platform (docs/lists.md): the
Library holds every page loaded so far, and only the rows near the screen are
rendered. Discover's rails are horizontal lists inside a Scroll.
