# Primitives

Primitives are named for what they lay out or do, and their props use CSS names
where CSS has the concept ([naming](naming.md)).

Props take scalars or plain data: objects, arrays (`edges={['top']}`) and
nested combinations of them. They cross to the native view as data in the
typed batch, checked once in C++ against the prop's schema, with no JSON
made ([structured props](native-scheduling.md#structured-props)). Functions
and class instances cannot, at any depth.

## Basics

The views most screens are built from. Every one takes the style, layout and
accessibility props all views take, as props or through `class`
([styles](styles.md)).

### VStack and HStack

Stacks lay their children out in a column (`VStack`) or a row (`HStack`),
with CSS flexbox's props: `gap`, `alignItems`, `justifyContent`, `flexWrap`,
`padding` and the rest.

```tsx
import { HStack, Text, VStack } from 'kuito';

export default function Track() {
  return (
    <VStack padding={16} gap={4}>
      <Text fontWeight="bold">Night Drive</Text>
      <HStack gap={8} alignItems="center">
        <Text>Ada Ray</Text>
        <Text color="#8a8a96">3:42</Text>
      </HStack>
    </VStack>
  );
}
```

- In a right-to-left language an HStack's row runs right to left. Padding,
  margin and insets take logical sides (`paddingInlineStart`,
  `marginInlineEnd`) that follow it ([right to left](styles.md#right-to-left)).
- A stack with only layout props gets no native view of its own
  ([flattening](flattening.md)).

### Box

A container laid out like a VStack, for a view that is a surface or a shape
more than a stack of children: a card, a progress bar's track, a swatch.

```tsx
import { Box } from 'kuito';

export default function Progress() {
  return (
    <Box width={280} height={4} borderRadius={2} backgroundColor="#e5e7eb">
      <Box width="40%" height={4} borderRadius={2} backgroundColor="#e5484d" />
    </Box>
  );
}
```

It takes the same props as the stacks, and is flattened by the same rule.

### Text

Text shows a string. Its children are text only (strings, numbers or signals
of them), never elements, and it wraps over as many lines as it needs.

```tsx
import { Text, signal } from 'kuito';

export default function Title() {
  const plays = signal(12);

  return (
    <Text fontSize={17} fontWeight={600} lineClamp={2} maxFontScale={1.5}>
      {`Played ${plays.value} times`}
    </Text>
  );
}
```

- Font: `color`, `fontSize`, `fontWeight` (`normal`, `bold` or 100 to 900),
  `fontFamily`, `fontStyle`, `lineHeight`, `letterSpacing`, `textAlign`
  (`left`, `center` or `right`) and `textTransform`.
- `lineClamp` cuts it to that many lines; 0, the default, is no limit.
- Text follows the user's text size: Dynamic Type on iOS, the font scale on
  Android. `maxFontScale` caps how far it grows, as a factor of `fontSize`; at
  `1` it never grows past `fontSize`. A smaller user size still shrinks it
  ([text size](appearance.md#text-size)).

### Button

The platform's own button: a system `UIButton` on iOS, an
`android.widget.Button` on Android. Its children are its title.

```tsx
import { Button, signal } from 'kuito';

export default function Retry() {
  const loading = signal(false);

  return (
    <Button disabled={loading.value} onPress={() => (loading.value = true)}>
      Try again
    </Button>
  );
}
```

`onPress` fires on a completed tap and `disabled` ignores taps. It takes
Text's font props and its title follows the user's text size, but with no
`maxFontScale`: only Text caps the growth.
For a pressable area of your own design, use [Pressable](#pressable).

### Toggle

An on/off switch: a `UISwitch` on iOS, a `Switch` on Android. `checked` is
two-way: given a signal, the Toggle writes it as the user flips it
([two-way props](events.md#two-way-props)).

```tsx
import { HStack, Text, Toggle, signal } from 'kuito';

export default function Downloads() {
  const wifiOnly = signal(true);

  return (
    <HStack gap={12} alignItems="center">
      <Text>Download on Wi-Fi only</Text>
      <Toggle checked={wifiOnly} />
    </HStack>
  );
}
```

`onChange` receives the new `checked` value, and `disabled` ignores the
user's input.

### Spinner

The platform's indeterminate progress indicator: a `UIActivityIndicatorView`
on iOS, a `ProgressBar` on Android.

```tsx
import { Spinner, VStack, signal } from 'kuito';

export default function Loading() {
  const loading = signal(true);

  return (
    <VStack flex={1} justifyContent="center" alignItems="center">
      <Spinner animating={loading.value} />
    </VStack>
  );
}
```

It spins while `animating` is true, which it is by default.

### Spacer

An empty view that grows to take the free space along its stack's axis
(`flexGrow: 1`), pushing what follows it to the end.

```tsx
import { HStack, Spacer, Text } from 'kuito';

export default function Header() {
  return (
    <HStack padding={16}>
      <Text>Library</Text>
      <Spacer />
      <Text>Edit</Text>
    </HStack>
  );
}
```

It takes no props of its own, and has no native view while it has only
layout props.

### Divider

A hairline: a view at least 1 point tall, in the system's separator color on
iOS and light gray on Android. `backgroundColor` changes its color.

```tsx
import { Divider, Text, VStack } from 'kuito';

export default function Settings() {
  return (
    <VStack>
      <Text padding={16}>Account</Text>
      <Divider marginInlineStart={16} />
      <Text padding={16}>Notifications</Text>
    </VStack>
  );
}
```

In a VStack it stretches across the stack. In an HStack it stretches to the
row's height but has no width, so give it `width={1}`.

### Fragment

Groups children with no view of its own: they join the Fragment's parent as
if written there. `<>…</>` is the same thing; write `Fragment` to give it a
`key`.

```tsx
import { Fragment, Text, VStack } from 'kuito';

const albums = [
  { id: 'a1', title: 'Night Drive', artist: 'Ada Ray' },
  { id: 'a2', title: 'Low Tide', artist: 'The Shoals' },
];

export default function Albums() {
  return (
    <VStack gap={4}>
      {albums.map((album) => (
        <Fragment key={album.id}>
          <Text fontWeight="bold">{album.title}</Text>
          <Text>{album.artist}</Text>
        </Fragment>
      ))}
    </VStack>
  );
}
```

## SafeArea

A VStack padded by the part of it the system covers: status bar, notch or
Dynamic Island, home indicator, navigation bar. The app draws edge to edge, so
backgrounds run under those areas while SafeArea keeps content clear.

```tsx
import { SafeArea, Scroll, Text } from 'kuito';

<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>;
```

<!-- SafeArea props: generated from src/protocol/manifest.ts -->

| Prop    | Meaning                                                                |
| ------- | ---------------------------------------------------------------------- |
| `edges` | Which of `top`, `right`, `bottom`, `left` to pad; all four by default. |

<!-- end of generated props -->

- **Only the overlap counts**, as with react-native-safe-area-context's native
  SafeArea: a SafeArea in the middle of the screen gets no inset, and
  one at the bottom gets exactly the home indicator's height.
- The inset adds to the view's own `padding`.
- Insets follow rotation and system bar changes.

## Sheet

A native bottom sheet: `UISheetPresentationController` on iOS, Material's
`BottomSheetDialog` on Android. Platform gestures, the scroll-to-expand
handoff, accessibility and back/backdrop dismissal come with it. Its children
are ordinary Kuito views laid out by the shared engine inside the sheet.

```tsx
import { Sheet, Text, signal } from 'kuito';

const queueOpen = signal(false);

<Sheet
  open={queueOpen.value}
  snapPoints={['content', '90%']}
  onClose={() => (queueOpen.value = false)}
  backgroundColor="#111827"
  padding={24}
>
  <Text>Up next</Text>
</Sheet>;
```

<!-- Sheet props: generated from src/protocol/manifest.ts -->

| Prop           | Meaning                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open`         | Shows the sheet while true. Controlled: set it back to false in `onClose`.                                                                                               |
| `onClose`      | The user dismissed it (swipe, backdrop or back); set `open` back to false.                                                                                               |
| `snapPoints`   | Resting heights, smallest first: points, `'50%'`, or `'content'` (default).                                                                                              |
| `onSnap`       | `{ index }` of the snap point the sheet settled at.                                                                                                                      |
| `grabber`      | The drag handle; shown by default.                                                                                                                                       |
| `dismissible`  | Whether swiping down or tapping outside dismisses it; true by default.                                                                                                   |
| `borderRadius` | The sheet's corner radius.                                                                                                                                               |
| `motion`       | `sheetMotion()`: its `height` and its `progress` between its snap points move with the sheet every frame, on the UI thread ([motion sources](motion.md#motion-sources)). |

<!-- end of generated props -->

- **Safe-area aware.** The sheet runs to the screen's bottom edge, under the
  home indicator or the navigation bar, and its content stays clear of them
  and, in landscape, of the screen's sides; padding adds to that.
  `'content'` sizes the sheet to its children plus that inset. A sheet
  holding one view, as a sheet route's screen, gives that view the inset as
  padding, so the view's background fills the sheet to its edges.
- Style props (background, padding, gap) apply inside the sheet.
- With several snap points, children that grow (`flex: 1`) fill the sheet:
  a `Scroll` inside scrolls within its height rather than collapsing.
- A percentage is of the height the sheet can take: the screen below the
  status bar. The sheet runs under the navigation bar and home indicator;
  its content stays clear of them.
- Android's sheet rests at up to three heights (collapsed, half-expanded and
  expanded), so at most three snap points take effect there.
- On iOS 26 and later the system draws sheets floating, inset from the screen
  edges.

## Pressable

A container (laid out like `VStack`) that responds to touches.

```tsx
import { Pressable, Text, actionSheet, signal } from 'kuito';

const expanded = signal(false);

function open() {
  expanded.value = !expanded.value;
}

async function showMenu() {
  await actionSheet({ buttons: [{ text: 'Share' }, { text: 'Cancel', style: 'cancel' }] });
}

<Pressable
  onPress={open}
  onLongPress={showMenu}
  pressedOpacity={0.7}
  pressedScale={0.97}
  haptic="light"
>
  <Text>Open</Text>
</Pressable>;
```

<!-- Pressable props: generated from src/protocol/manifest.ts -->

| Prop                          | Meaning                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `onPress`                     | A completed press. Not called when a long press fired.    |
| `onPressStart` / `onPressEnd` | Touch down / up or cancel.                                |
| `onLongPress`                 | Held for `longPressDuration` ms (500 by default).         |
| `disabled`                    | Ignores touches.                                          |
| `hitArea`                     | Extra touchable margin in points.                         |
| `pressedOpacity` _(Kuito)_    | Opacity while pressed, like `TouchableOpacity`. 1 = none. |
| `pressedScale` _(Kuito)_      | Scale while pressed, e.g. `0.97`. 1 = none.               |
| `haptic` _(Kuito)_            | `light`, `medium`, `heavy` or `selection` on press-in.    |

<!-- end of generated props -->

Events carry `locationX`/`locationY` (in the view) and `pageX`/`pageY` (on
screen), in points. A Pressable is one screen reader element, read as its
children's text unless it has a `label` (see
[accessibility](accessibility.md)).

- **Feedback is native.** Opacity, scale and haptics run on touch-down in UIKit
  or Android Views, without waiting for JavaScript. They compose with the
  view's own `opacity` and transforms, so a pressed card keeps its styling.
- **The innermost Pressable handles a press**, as with React Native's
  responder: a press on a nested Pressable does not also press its parent.
- A touch that moves 20 points beyond the view (plus `hitArea`) cancels the
  press.
- Android extends the hit area through the parent's `TouchDelegate`, which
  holds one view: only one `hitArea` Pressable per parent takes effect there.

## TextField

A text input: `value` (its text, two-way when given a signal), `placeholder`,
`placeholderColor`, `selectionColor` (cursor and selection), `disabled`, and
the `onChange` (the text), `onSubmit`, `onFocus` and `onBlur` events.
Text styles (`color`, `font-size`) apply to the typed text. A TextField with a
background draws only that background; without one it keeps the platform's
field look. `enterKeyHint`, `submitBehavior`, `autoFocus` and `ref.focus()`
work as in HTML; `enterKeyHint="next"` moves to the next input
natively ([keyboard](keyboard.md)). So do HTML's input attributes: `type`
(`password`, `email`, ...), `inputMode`, `autoComplete`, `autoCapitalize`,
`spellCheck` and `maxLength` ([what a field takes](keyboard.md#what-a-field-takes)).
With `lines` it wraps its text over a count of lines, or grows within a
`{ min, max }` range ([lines](keyboard.md#lines)). Its `selection` is a
two-way `{ start, end }` value with an `onSelectionChange` event
([selection](keyboard.md#selection)).

```tsx
import { TextField, signal } from 'kuito';
import css from './search.css';

const query = signal('');

<TextField
  class={css.field}
  placeholder="Search"
  placeholderColor="#8a8a96"
  selectionColor="#ff5a5f"
  value={query}
/>;
```

## Image

React Native's Image for URLs (`https`, `file` and `data:`) and for images
bundled with the app, with caching and loading polish built in.

```tsx
import { Image } from 'kuito';

<Image
  src={{ uri: 'https://example.com/cover.jpg' }}
  aspectRatio={1.5}
  placeholder="#1e293b"
  fadeDuration={250}
  onLoad={(event) => console.log(event.width, event.height)}
/>;
```

An imported image is bundled into both shells by the compiler
([assets](assets.md)): PNG and JPEG with their `@2x` and `@3x` siblings, and
SVG and PDF drawn as vectors. Its size is known when the app compiles, so it
needs no `width`, `height` or `aspectRatio`:

```tsx
import { Image } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />;
```

<!-- Image props: generated from src/protocol/manifest.ts -->

| Prop                        | Meaning                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src`                       | A URL string, `{ uri, headers? }`, or an imported image ([assets](assets.md)).                                         |
| `objectFit`                 | CSS's `object-fit`: `cover` (default), `contain`, `fill` or `none`.                                                    |
| `tintColor`                 | Recolors opaque pixels, for icons.                                                                                     |
| `onLoadStart` / `onLoadEnd` | Around every load, success or failure.                                                                                 |
| `onLoad`                    | `{ width, height }` of the image in pixels.                                                                            |
| `onError`                   | `{ error }`, e.g. `"HTTP 404"`.                                                                                        |
| `aspectRatio` _(Kuito)_     | Width ÷ height: sizes the view before the image arrives.                                                               |
| `placeholder` _(Kuito)_     | Color shown while loading.                                                                                             |
| `thumbhash` _(Kuito)_       | A base64 [ThumbHash](https://evanw.github.io/thumbhash/): its blurred preview shows while loading, over `placeholder`. |
| `fadeDuration` _(Kuito)_    | Cross-fade in milliseconds when the image appears; 0 by default.                                                       |
| `cache` _(Kuito)_           | `memory-disk` (default), `memory`, `disk` or `none`.                                                                   |

<!-- end of generated props -->

- **Decoded at the size it is shown.** Once the view has its size, the
  renderer decodes the image divided by the largest power of two that still
  covers the view's pixels on both sides (ImageIO thumbnails on iOS,
  `inSampleSize` on Android), so a 3000 × 2000 photo in a 100-point square
  never costs its full 24 MB. When the view grows past that, it decodes
  again from the cached bytes, keeping the current image on screen.
  `objectFit="none"` shows the image at its own size, so it decodes it whole,
  as does a view with no size yet. `onLoad` reports the image's own size,
  never the decoded one.
- **Caching.** Decoded images stay in a memory cache (64 MB on iOS, an eighth
  of the heap on Android), keyed by URL and the power of two they were
  divided by: a view smaller than a decoded image shows that image. Remote
  bytes stay in a disk cache under the app's caches directory, as
  downloaded and keyed by URL alone, independent of HTTP cache headers, so a
  new size never downloads the image again. With `cache="memory"` or
  `"none"` the bytes are not kept, and a view that outgrows its decode
  downloads the image again.
- **One request per URL.** Views asking for an image already in flight wait
  for that request instead of starting another, whatever sizes they show it
  at.
- **Request headers.** `src={{ uri, headers: { Authorization: token } }}`
  sends them with the request. Both caches key an image by URL alone, so a
  refreshed token still finds it.
- **ThumbHash preview.** `thumbhash` takes the base64 string ThumbHash's
  encoder makes on the server from the full image. The renderer decodes it
  off the main thread into a blurred 32-pixel preview, fitted as `objectFit`
  fits the image, over the `placeholder` color.
- **Prefetch.** `image.prefetch(src, { cache })` loads an image into the
  caches before an Image shows it, and resolves its size in pixels, read
  from the image's header. With a disk cache (`memory-disk`, `disk`) it keeps
  a remote image's bytes and leaves decoding to the Image, which knows its
  size; `memory` decodes the whole image.
  It takes what `src` takes but a bundled image, and `cache` is
  `memory-disk` (default), `memory` or `disk`. A failed load rejects with
  `onError`'s message.

  ```tsx
  import { image } from 'kuito';

  const { width, height } = await image.prefetch({
    uri: 'https://example.com/cover.jpg',
    headers: { Authorization: 'Bearer token' },
  });
  ```

- **Decoding happens off the main thread**, so scrolling past a new image does
  not stall a frame.
- Like React Native's network images, an Image of a URL has no intrinsic
  size: give it `width`/`height`, stretch it in a stack, or set `aspectRatio`.
  A bundled image is its own size in points unless a size prop or class says
  otherwise, and keeps its aspect ratio when only one side is given.
- Changing `src` ignores a slower earlier load that finishes later.

## Symbol

The platform's own symbols, by name: an [SF Symbol](https://developer.apple.com/sf-symbols/)
on iOS and a [Material Symbol](https://fonts.google.com/icons) on Android, as tabs
show them ([assets](assets.md#symbols)).

```tsx
import { HStack, Symbol } from 'kuito';

<HStack gap={8}>
  <Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
  <Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
</HStack>;
```

<!-- Symbol props: generated from src/protocol/manifest.ts -->

| Prop                  | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `name` _(Kuito)_      | An SF Symbol on iOS and a Material Symbol on Android, or `{ ios, android }`. |
| `size` _(Kuito)_      | In points; 24 by default, and the view’s size.                               |
| `weight` _(Kuito)_    | `ultralight` to `black`; `regular` by default.                               |
| `tintColor` _(Kuito)_ | The symbol’s color; black by default.                                        |

<!-- end of generated props -->

A literal name a platform lacks is a compile error at its line.

## Scroll

A view that scrolls its content, vertically or, with `horizontal`, across:
a UIScrollView on iOS. Its children are laid out along its axis; padding and
gap apply to the content.

<!-- Scroll props: generated from src/protocol/manifest.ts -->

| Prop                              | Meaning                                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horizontal`                      | Scroll sideways. Changing it remounts the view.                                                                                                                                                                |
| `onScroll`, `scrollInterval`      | `{ x, y, contentWidth, contentHeight, layoutWidth, layoutHeight }` in points, at most once per throttle (50 ms by default).                                                                                    |
| `onScrollEnd`                     | HTML's `scrollend`: the same fields, where it came to rest after a fling, a drag or a `scrollTo`, once per rest.                                                                                               |
| `onReachEnd`, `reachEndThreshold` | Once each time the end comes within the threshold, in visible lengths (0.5 by default).                                                                                                                        |
| `onRefresh`, `refreshing`         | Pull-to-refresh (vertical only).                                                                                                                                                                               |
| `scrollbar`                       | Shows or hides the scrollbar.                                                                                                                                                                                  |
| `motion`                          | `scrollMotion()`: its `offset`, `velocity` and `overscroll` move with the view every frame, on the UI thread ([motion sources](motion.md#motion-sources)).                                                     |
| `paging`, `snapOffsets`           | Where a drag comes to rest: whole pages, or the offsets given ([paging and snapping](#paging-and-snapping)).                                                                                                   |
| `keyboard`                        | `{ dismiss, persistTaps, inset, avoid }`: when dragging dismisses the keyboard, what a tap outside the field does, whether content stays clear of it (true by default) ([keyboard](keyboard.md#scroll-views)). |

<!-- end of generated props -->

- **It clips its content** to its frame and its rounded corners on both
  platforms, whatever its `overflow`, as a scroll container does in CSS.
- **Scroll work is opt-in.** The native view sends scroll events only while
  `onScroll` is set and installs pull-to-refresh only while `onRefresh` is, so
  a plain Scroll never crosses into JavaScript as it scrolls.
- End-reached fires once per content length: when content grows, it re-arms.
  Content shorter than the view counts as reaching the end, as in React
  Native.

### Scrolling from code

A Scroll's ref holds a `ScrollHandle`: its element, with `scrollTo` and
`scrollToEnd`, the same two a List's `ListHandle` has.

```tsx
import { Button, Scroll, Text, VStack, ref, type ScrollHandle } from 'kuito';

export function Feed() {
  const feed = ref<ScrollHandle>();

  return (
    <VStack flex={1}>
      <Button onPress={() => feed.current?.scrollTo({ offset: 0 })}>Top</Button>
      <Button onPress={() => feed.current?.scrollToEnd({ animated: false })}>Latest</Button>
      <Scroll ref={feed} flex={1}>
        <Text>Today</Text>
      </Scroll>
    </VStack>
  );
}
```

`offset` is in points along the Scroll's axis, and both animate unless
`animated` is false. A Scroll also takes `scrollTo({ page })`: a whole view
length each from 0, where `paging` rests, so code that doesn't know the
view's size can still page it ([Pager](pager.md)); a list's rows are no
pages, and a List refuses one. A Scroll's request lands once the layout has sized the
content the same update brought: appending a message and calling
`scrollToEnd` in one handler shows the new message. Offsets past the end
stop at the end.

### Paging and snapping

`paging` makes a drag come to rest a whole view length at a time, one page
from where the finger let go; the last page ends at the end of the content.
`snapOffsets` lists offsets in points where a drag may come to rest instead:
the one nearest where scrolling would stop, moving on to the next one in the
fling's direction rather than back. The start and the end of the content are
resting points too, so content past the last offset stays reachable. While
`paging` is set, `snapOffsets` is ignored.

`onScrollEnd` reports where the view came to rest, once per rest: after a
fling, a drag that stops where the finger lets go, or a `scrollTo`, never
while a finger holds it. UIKit says so itself; Android, whose scroll views
only report moving, sends it from the first display frame that finds the
view still for two frames at 60 Hz with no finger on it. Lists don't send
it yet.

UIKit pages with `isPagingEnabled` and snaps in
`scrollViewWillEndDragging`; Android, whose scroll views do neither, settles
at the same offsets when a fling or a drag ends.

## List

A list virtualized by the platform: a UICollectionView or
RecyclerView owns scrolling and recycling, and JavaScript renders only the
rows near the screen ([how it works](lists.md)).

```tsx
import { Divider, List, Text, ref, signal, type ListHandle } from 'kuito';

type Track = { id: string; title: string };

const tracks = signal<Track[]>([]);
const refreshing = signal(false);

async function page(offset: number): Promise<Track[]> {
  const response = await fetch(`https://example.com/tracks?offset=${offset}`);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Track[];
}

async function loadMore() {
  tracks.value = [...tracks.value, ...(await page(tracks.value.length))];
}

async function reload() {
  refreshing.value = true;
  try {
    tracks.value = await page(0);
  } finally {
    refreshing.value = false;
  }
}

function TrackRow({ track, position }: { track: Track; position: number }) {
  return <Text>{position + '. ' + track.title}</Text>;
}

export function Tracks() {
  const list = ref<ListHandle>();

  return (
    <List
      ref={list}
      data={tracks.value}
      itemKey={(track) => track.id}
      renderItem={({ item, index }) => <TrackRow track={item} position={index.value + 1} />}
      separator={Divider}
      header={<Text>Top tracks</Text>}
      empty={<Text>No tracks yet</Text>}
      onReachEnd={loadMore}
      refreshing={refreshing.value}
      onRefresh={reload}
    />
  );
}
```

Supports `data` (the items, a signal of them, or a [store](reactivity.md#stores)
array), `renderItem` (it receives `item`, `index`, a signal of the row's
position as in `For`, and `visible`, a signal of whether the row is on screen), `itemKey` (default: `item.key`, then
`item.id`, then a store item's identity, then the index; keys must be unique),
`sectionKey`, `renderSection` and `stickySections` ([sections](lists.md#sections-and-sticky-headers)),
`separator`, `header`, `footer`,
`empty` (each a component or an element), `columns`,
`horizontal`, `inverted`, `initialIndex`, `estimatedItemSize`,
`onViewableChange` with `viewability.threshold` (the fraction of a row on screen that counts),
`onReachEnd`/`reachEndThreshold`, pull-to-refresh, and the Scroll
props. A ref (`ref<ListHandle>()`) has `scrollToIndex`, `scrollToItem`,
`scrollTo` and `scrollToEnd`; `scrollToIndex({ index, align, margin })` lands the
item at `align` (0 the start, 0.5 the middle, 1 the end) with `margin` points
kept before it, as CSS's `scroll-margin`.

- **Rows are recycled natively.** A cell scrolled away is re-bound to another
  row: same native views, changed props only. A row's component state belongs
  to its item and starts fresh when its cell shows another item.
- **Data changes animate.** New `data` reaches the native list as keys, which
  it diffs into inserts, removals and moves.
- **Only what changed renders.** New `data` re-renders the bound rows whose
  item changed, and the parts of a row that read `index` when it moved; a
  signal read in `renderItem` re-renders the rows that read it, so a row never
  needs an outside dependency. Over a store array, a field write
  (`items[3].liked = true`) is one prop write on that row's cell.
- **No `getItemLayout`.** Rows measure themselves; `scrollToIndex` lands on
  the row as the rows around it are measured.
- `columns` lays items out in columns; `gap` (or `rowGap` and
  `columnGap`, as a stylesheet's `gap` compiles) spaces rows and columns. The
  header, footer and empty rows span every column, and grids have no
  separators.

Deliberate differences from React Native:

- `getItemLayout`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`,
  `removeClippedSubviews` and `CellRendererComponent` do not exist: the
  platform decides what to render.
- A row's events bubble through its cell to the list and its ancestors, but a
  row is a separate module: it re-renders on its own, never with the screen.
- A list's min-content length is zero (CSS would use its content's), so a
  `flex: 1` column holding a list is not stretched to every row's length.
- `renderItem` gets `{ item, index }`; there is no `separators` helper.
- Like React Native, a vertical list inside a vertical Scroll renders
  every row: give lists their own scroll.
