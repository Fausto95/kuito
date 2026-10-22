# Native lists

`List` is virtualized by the platform: a `UICollectionView` on iOS and a
`RecyclerView` on Android own scrolling, recycling and which rows exist.
JavaScript renders a row only when the native list asks for it, and a recycled
cell is re-bound by the ordinary patch diff instead of being created again.
Scrolling never waits for JavaScript.

```
List (src/ui/flat-list.tsx)          native List (Views/KuitoListView)
  keys as edits ────────────────────────▶  inserts, removes, moves rows
                                            picks a cell for each row near
  bind(cell, key) ◀────────────────────── the viewport (render-ahead window)
  renderCell: patch the cell's module ──▶  ListCell + row views, cellKey ack
  row signals: item, index, visible ────▶  one prop write per field write
                                            measures the row (its own layout
                                            root), shows it, keeps its size
```

## Who owns what

- **The native list** owns the cells and decides which cell shows which key.
  For a row it reuses the cell already holding that key, else the least
  recently used free cell, else a new one. It keeps a cell for every row
  within a screen ahead of the viewport (half a screen behind) and eight
  off-screen spares, so rows render before they scroll in and scrolling back
  a little needs no JavaScript at all. Both renderers make that choice in
  one table in C++ (`native/shared/ListCells.h`) and keep only the views; a
  cell on screen, or held by Android's sticky overlay, is never reused.
- **JavaScript** renders a row into the cell it is asked for. Each cell is a
  module of its own (`src/runtime/lists.ts`) whose root is the `ListCell`
  view. Re-binding a cell to another key patches that module: same views,
  props diffed. The row's components start fresh for the new item (state,
  mount hooks, tasks), as in React Native, where a row's state belongs to its
  item.
  When new data drops a bound row's key, its cell renders nothing: the
  native list may keep that cell and show it again, unasked, if the key
  returns, and new data renders the row back into it.
- **Layout**: every row is a layout root in the shared flexbox engine, as
  wide as its column (a vertical list) or as its content (a horizontal list).
  Measured sizes are cached by key, so a row seen before comes back at its
  real size. A row not rendered yet takes its cached size, `estimatedItemSize`,
  or the average measured row, and shows blank until it arrives.

## Stores and fine-grained rows

A row is reactive, not memoized. Each bound row keeps signals of its own
(`src/ui/flat-list.tsx`): its item, its index, whether it is the last row,
and whether it is on screen. New data moves each row to its item's place,
writing those signals, and only the bindings that read one that changed run
again: a row whose item is the same object and that never reads `index`
renders nothing when rows are inserted above it.

Over a [store](reactivity.md#stores) array, the items are the store's
objects, so a field write never changes the item at all:

```tsx
import { List, Pressable, Spinner, Text, store } from 'kuito';

type Book = { id: string; title: string; liked: boolean };

const shelf = store({ books: [] as Book[] });

<List
  data={shelf.books}
  renderItem={({ item, visible }) => (
    <Pressable onPress={() => (item.liked = !item.liked)}>
      <Text>{item.title}</Text>
      <Text>{item.liked ? '♥' : '♡'}</Text>
      <Spinner animating={visible.value} />
    </Pressable>
  )}
/>;
```

- `items[3].liked = true` reaches the one binding that reads it: one prop
  write on one cell, no row re-rendered and no keys sent.
- `push`, `splice` and `sort` send the list the edits to its keys (see
  [Keys](#keys)); rows keep their cells.
- An item with no `key` or `id` is keyed by its identity in the store, so it
  keeps its key wherever it moves. Replacing an index with another object is
  a new item.

`visible` is a signal per row, fed by the native `viewable` range and the
`viewability` threshold: start a video or a fetch while the row is on screen,
and stop it when it leaves. `viewability={{ threshold }}` is the fraction of
a row, 0 to 1, that must be on screen, as `IntersectionObserver`'s threshold.
`onViewableChange` reports the same range as `{ item, key, index, visible }`
entries: the rows now visible, and the ones that changed. Reporting the range costs the native list
work on every scroll, so it starts only once a row reads `visible` or
`onViewableChange` is set.

## Sections and sticky headers

`List` has sections without a second list type: `sectionKey` names each
item's section, and each run of items with the same section gets a header row
that `renderSection` renders, given the section and its first item.
`stickySections` keeps a section's header at the top of the list while its
section scrolls under it; the next header pushes it up as it arrives.

```tsx
import { List, Text, store } from 'kuito';
import css from './library.css';

type Song = { id: string; title: string; album: string };

const library = store({ songs: [] as Song[] });

<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <Text>{item.title}</Text>}
/>;
```

- A section's items must be next to each other in `data`: a section that
  comes twice is an error.
- Header rows span every column of a grid, and no separator follows a
  section's last item.
- `sectionKey` is read like `itemKey`: over a store array, an item whose
  section changes moves to its new section.
- Sticky headers need a vertical list that is not inverted; anything else is
  an error. On iOS the list's layout pins the header row in place; on Android
  an overlay above the RecyclerView hosts the header's cell while it is
  pinned. Either way the header is the row JavaScript rendered, with its
  handlers.

## Short lists: For

A list of a few dozen rows inside a `Scroll` needs no virtualization: use
[`For`](control-flow.md#for). It renders every row, keyed by item, and a
reorder moves the rows' views instead of planning the screen again. Over a
store array it gets the same one-prop-per-field-write updates as `List`.

## Keys

A list's keys cross the host boundary as edits to the keys it was sent last,
never as the whole array again: an append is one insertion, a removal one
removal, whatever the list's length. The kernel (`src/runtime/key-diff.ts`)
compares the keys with the ones it sent and writes, in order:

1. a removal for each key that left, at its index once the removals before it
   are done;
2. a move for each key that changed place, the fewest that reach the new
   order: keys on a longest run already in order stay, as when the kernel
   reorders a view's children (`src/runtime/reconcile.ts`);
3. an insertion for each new key, at its final index, first to last.

Each edit applies to the keys the edits before it left; a move's index counts
once the key has left its place. The first keys are all insertions at the
end, and null clears the list.

Both renderers apply a diff whole through one editor in C++
(`native/shared/ListKeys.h`, adapted by each platform's `Views/KuitoListKeys`),
which hands back each key's place as numbers, never the keys: a removal must
name the key at its index, a move a key the list has, an insertion a key it
lacks and an index inside the list. An edit that does not fit throws
`unsupportedValue` on `keys` and leaves the keys as they were; a key inserted
twice is the same error, as keys must be unique. The list then indexes its
keys again, sticky rows included, so a sticky header pins at its key's new
place. On iOS the diffable data source animates the change; on Android the
adapter is told each insertion, removal and move as it happens, with no
`DiffUtil` pass. The first rows and a list emptied load at once.

## Host protocol

Native kinds: `List`, `HorizontalList` (the axis is fixed when the view is
created, like Scroll's) and `ListCell`.

| List prop                            | Value                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`                               | Edits to the row keys sent last (see [Keys](#keys)); the keys are unique, and changes animate                                                                                                                       |
| `stickyKeys`                         | Rows that stick to the top while their section scrolls (`List` only)                                                                                                                                                |
| `spanningKeys`                       | Rows that span every column (header, footer, empty, sections)                                                                                                                                                       |
| `numColumns`                         | Columns of a vertical list                                                                                                                                                                                          |
| `gap`, `rowGap`, `columnGap`         | Points between rows and between columns, as in a flex container: `rowGap` between a vertical list's rows, `columnGap` between a grid's columns and a horizontal list's rows; `gap` sets both (layout props as well) |
| `inverted`                           | First row at the end; the list and each row are flipped                                                                                                                                                             |
| `estimatedItemSize`                  | Length of a row not measured yet                                                                                                                                                                                    |
| `initialScrollKey`                   | Row to show first, once it exists                                                                                                                                                                                   |
| `scrollTo`                           | A request: `{ key, animated, align, margin }` , `{ offset, animated }` or `{ end, animated }`, numbered by `request`; not state, so planning the list again never unsets it (Scroll takes it too)                   |
| `emitsViewable`, `viewableThreshold` | Report the visible rows; fraction of a row that counts                                                                                                                                                              |
| scroll props                         | `emitsScroll`, `scrollInterval`, `reachEndThreshold`, `refreshable`, `refreshing`, `scrollbar`, `keyboard`, as Scroll                                                                                               |

| ListCell prop | Value                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `cellKey`     | The key JavaScript rendered into the cell; the row shows when it matches the key the list asked for |

| List event          | Payload                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `bind`              | `{ cell, key }`: render `key` into `cell` (`<list>:cell-<n>`), creating the ListCell the first time |
| `viewable`          | `{ first, last }`: keys of the first and last visible rows                                          |
| `reachend`          | Once per row count                                                                                  |
| `scroll`, `refresh` | As Scroll                                                                                           |

Header, footer and empty rows are rows with the keys `#header`, `#footer` and
`#empty`, and a section's header is `#section:<section>`; an item key must not
take one. When a list is removed, the kernel
removes its cells (and their rows) first.

## How it avoids the usual list problems

- **Blank areas while scrolling fast**: rows a screen ahead are bound before
  they appear, and a row keeps its size while it waits, so nothing jumps. A
  very fast fling can still outrun JavaScript; those rows show blank for a
  frame or two, never stale content.
- **`onReachEnd` firing repeatedly**: it fires once per row count, not per
  content length, so rows measuring themselves cannot re-fire it.
- **`getItemLayout` for scroll-to-index**: the list scrolls to the row's
  estimated position and lands on it exactly as the rows around it are
  measured. A far animated jump cuts to a screen before the target and
  animates the rest.
- **Rows hidden behind the keyboard**: a vertical list insets its content by
  the part the keyboard covers, on top of its padding, and scrolls a focused
  input in a row above it, as Scroll does (docs/keyboard.md). No
  `KeyboardAvoidingView` around it.
- **Re-rendering every row when outside data changes**: only bound rows
  (those on or near the screen) render again, when their item changed, and a
  signal or store path read in `renderItem` re-renders just the parts of the
  rows that read it.
