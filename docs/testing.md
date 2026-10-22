# Testing

An app's tests run on the **headless host**: the kernel the app runs on
devices, in Node, with its batches decoded, checked and laid out by the
shells' own C++ compiled to WebAssembly. Frames come from the same layout
engine as on iOS and Android, and text is measured from a font table the test
declares. No simulator, emulator, Xcode or Android SDK is involved.

```bash
kuito test
```

finds every `*.test.ts` and `*.test.tsx` in the
app (outside `node_modules`, `dist` and `.kuito`) and runs each in a host of
its own with Node's test runner. Name files to run only those:
`kuito test tests/home.test.tsx`. Tests compile for iOS unless the command
names `android`.

```tsx
import { Button, Text, VStack, signal } from 'kuito';
import { assert, press, render, screen, test } from 'kuito/tests';

function Home() {
  const count = signal(0);

  return (
    <VStack>
      <Text>{count.value}</Text>
      <Button onPress={() => count.value++}>Add one</Button>
    </VStack>
  );
}

test('Add one counts the presses', async () => {
  await render(<Home />);

  await press(screen.getByText('Add one'));

  assert.ok(screen.getByText('1'));
});
```

A test file is compiled like the app (styles, routes, UI-thread functions,
native module stubs), so it imports the app's components as they are.
`kuito/tests` also exports Node's `test`, `describe` and strict `assert`,
so a test file has one import and needs no `@types/node`.

## Rendering

`await render(<App />, options)` makes the tree the screen's only root and
resolves once the app has settled: events, module calls, requests and timers
due now have run, and lists have bound the rows near their viewport. Each
render starts from no views; module-level state (a store's signals) lasts
for the file, as it does for an app's life.

| Option    | What it is                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `fonts`   | The [font table](#fonts) text is measured with.                                                         |
| `screen`  | The window: `{ width, height, scale, insets }` in points. An iPhone 18 Pro's by default (402×874, @3x). |
| `modules` | [Fakes](#native-modules) for native modules, by module and member name.                                 |
| `fetch`   | Answers the app's requests: `(request) => ({ status?, headers?, body? })`. Without it a request fails.  |

It returns the rendered app: the queries below, and

- `tree()`: every view, one line each, as a device describes its tree beside
  a recording ([devtools](devtools.md#recording-and-replay)): kind,
  parent, frame, and a label's text. A snapshot of it pins a layout.
- `mutations`: every mutation the kernel's batches carried since the render,
  as `native/shared/Mutation.h` has them (`create`, `prop` with its typed
  value, `move`, ...).
- `calls`: the native module calls the app made, with their arguments.
- `logs`: what the app and the runtime logged.
- `emit(module, name, value)`: a module's event or live value change, as the
  platform sends it (`app.emit('Location', 'change', fix)`).

## Queries

`screen` queries what the last render shows; `within(view)` queries inside
one view. Only what is on screen counts: a hidden subtree, a closed sheet and
a screen under another in its stack are not.

- `getByText(text)`: the one view showing `text` (a string matches the whole
  text, as shown after `textTransform`; a RegExp tests it).
- `getByRole(role, { name })`: the one view with ARIA's `role`, and with
  accessible name `name` when given: its `label`, or the text inside it. A
  view without `role` has its kind's: `Button` is a `button`, `Toggle` a
  `switch`, `Image` and `Symbol` an `img`, `TextField` a `textbox`, `Spinner`
  a `progressbar`, `DatePicker` a `button`, `Select` a `combobox`,
  `SegmentedControl` a `radiogroup`, `Drawing` an `img`.
- `getAllBy…` returns every match and throws on none; `queryBy…` returns
  null on none. A `get` that finds none throws with the tree.

Tests find what a user finds, so there is no query by test id: scope with
`within` and roles instead.

A view a query returns reads what the view holds now: `id`, `kind`, `text`,
`props` (as a shell receives them: colors as `0xRRGGBBAA`, structured props
as their data),
`frame` (from the layout engine, relative to its parent), `windowFrame`
(where it shows in the window, scrolling included), `parent` and `children`.

## Interactions

Each sends the events a device's views send, with their payloads, through
the path a shell takes (the UI thread's handlers first, then the kernel's),
and settles what they started.

- `press(view, { long })`: a tap at the center of `view`, or of the
  Pressable, Button or Toggle it is in. A Pressable reports `pressin`,
  `pressout` and `press`, with `{ locationX, locationY, pageX, pageY }`; a
  long press holds past 500 ms and reports `longpress` instead of `press`. A
  Toggle flips (`change` with `{ value }`). A disabled view takes no touch.
- `type(view, text)`: focuses the TextField and types at its caret,
  reporting its text after each character, as a keyboard does. A field with
  a `format` sends each edit to it first ([keyboard](keyboard.md#formatting)).
- `scroll(view, { x, y })`: scrolls the Scroll or list `view` is in. A list
  binds the rows that come near; the view reports `scroll` when the app
  listens, its `motion` at rest there (velocity and overscroll 0) when it has
  a `scrollMotion()`, `reachend` once per content length near its end, and a
  Scroll `scrollend` where it rests. A Scroll with `paging` rests on the
  page nearest the offset, and a Scroll's own `scrollTo` requests land after
  the layout of their batch, as on the platforms, and report `scrollend`.
- `choose(view, date)`: picks `date` in the DatePicker `view` is, as its
  picker reports a pick: what its type shows comes from `date`, the rest from
  its value ([DatePicker](date-picker.md#tests)). A day outside its `min` and
  `max` throws, as a user cannot pick it, and a disabled picker takes no
  touch. `choose(view, label)` picks the option of a Select or the segment
  of a SegmentedControl that shows `label`, and reports its value
  ([Select](select.md#tests)), and the item of the ContextMenu `view` is in
  that shows `label` ([ContextMenu](context-menu.md#tests)).
- `advance(ms)`: moves the test's clock. Time is virtual: timers fire and
  UI-thread animations step a frame at a time only as it advances.

## Fonts

Text is measured from a font table: each face's glyph advances, the kerning
between pairs, and its line height, at a point size. A label wraps at spaces
within its width, keeps a trailing space, breaks a word wider than a line,
and rounds its size up to the device's pixels, as UIKit sizes the iOS
renderer's labels. A face is picked by family, then the nearest weight, then
the nearest size, which it scales from.

```tsx
import { Text } from 'kuito';
import { assert, render, screen, test, type FontTable } from 'kuito/tests';

const fonts: FontTable = {
  faces: [{ weight: 400, size: 17, lineHeight: 20.3, advances: { i: 4.2 }, fallback: 9.5 }],
};

test('a label is as tall as its line', async () => {
  await render(<Text fontSize={17}>iii</Text>, { fonts });

  assert.ok(screen.getByText('iii').frame.height >= 20.3);
});
```

Without one, every glyph is half its size wide and a line 1.2 times its size:
layouts are deterministic, not the device's. For the device's frames,
generate a table from a simulator:

```bash
node node_modules/kuito/scripts/ios-font-table.ts "iPhone 18 Pro" recording.krec fonts.json
```

measures every face and glyph pair a recording's labels use with UIKit
(a `faces.json` of `{ faces: [{ size, weight }], text }` works too).
As UIKit does, the font's kerning applies only to text with a
`letterSpacing`: the iOS renderer always sets a label's kern, and a kern of
zero turns kerning off.

Reel's Discover screen, rendered headlessly with such a table and the
answers TVMaze gave the simulator, lays out every one of its 858 views
exactly as the iPhone 18 Pro simulator (iOS 27) did, to the tenth of a point
the tree prints (`test/headless.test.ts`, `benchmarks/headless-discover.md`).

## Native modules

`modules: { Clipboard: { readText: async () => 'copied' } }` answers the
app's calls by the module specs' names ([native modules](native-modules.md)):

- A function's fake is a function: it returns the result, or a promise of
  it, or throws `{ code, message }` to fail with that code.
- A live value's fake is its value (`Appearance: { colorScheme: 'dark' }`).
- A function that returns nothing does nothing unless faked. One that
  returns a value, and a live value, fail with `ERR_FUNCTION_NOT_FOUND`,
  naming the fake to add, unless the platform reports it itself: the
  window's metrics (from `screen`), the appearance (light, font scale 1), the
  app state (active), the launch URL (none), the splash screen and the
  status bar's height.
- The app lays out in its first language's direction, as on a device: fake
  `Localization: { locales: [{ textDirection: 'rtl', … }] }` to test right
  to left ([styles](styles.md#right-to-left)).

## Cost budgets

`costOf(interaction)` runs an interaction once the app has settled, settles
what it started, and returns what it cost the main thread in counts
([cost counters](performance.md#cost-counters)): records applied, prop
writes, layout passes, nodes laid out and framed, measures, UI-thread
entries and views created, each with the part that changed nothing
(`wastedPropWrites`, `wastedFrames`, ...). Counts do not depend on the
machine, so a budget fails like a correctness bug and never flakes:

```tsx
import { Pressable, Text, signal } from 'kuito';
import { costOf, press, render, screen, test } from 'kuito/tests';

function Feed() {
  const liked = signal(false);

  return (
    <Pressable onPress={() => (liked.value = !liked.value)}>
      <Text color={liked.value ? '#e5484d' : '#8b8d98'}>Like</Text>
    </Pressable>
  );
}

test('a like repaints and lays nothing out', async () => {
  await render(<Feed />);

  const cost = await costOf(() => press(screen.getByText('Like')));

  cost.toStayWithin({ layoutPasses: 0, measureCalls: 0, viewsCreated: 0 });
});
```

`toStayWithin` throws naming every counter over its budget. The headless
host lays the tree out after each batch, as a device does after a frame's
batches, and counts a pass only when the engine computed a node. Label
redraws and input waits happen in the platforms' views and shells: the
renderer tests count those.

## Golden tests

`replay(file, { fonts, screen })` replays a recording a device saved
([recording and replay](devtools.md#recording-and-replay)) on the headless
host with no JS, and returns the tree it leaves and the tree the device left
(`<file>.tree`, or null):

```tsx
import { assert, replay, test, type FontTable } from 'kuito/tests';

declare const fonts: FontTable; // the device's table, made by ios-font-table.ts

test('the scrolled feed lays out as on the device', async () => {
  const { tree, recorded } = await replay('tests/feed.krec', { fonts });

  assert.equal(tree, recorded);
});
```

Props cross by their number in the manifest, so a recording replays only
with the Kuito that recorded it: record again after an upgrade.

## What the headless host leaves out

- **UIKit's and Android's own drawing.** Colors, shadows, images and
  transforms are props the tree holds, not pixels.
- **Platform chrome.** A navigation bar is 54 pt and a tab bar 49 pt, an
  iPhone 18 Pro's on iOS 27; a sheet lays out at the screen's width and its
  first snap point's height.
- **Controls' own sizes.** A Toggle is 63×28, a Spinner 20×20, a Button its
  title in 15 pt with 6 pt above and below, a TextField its text with
  UIKit's rounded border: an iPhone's, measured on iOS 27.
- **List cell reuse.** Every row a list binds gets a cell of its own.
- **Android's layout.** Views lay out as the iOS renderer lays them out,
  whichever platform the test compiles for; Android sizes text and controls
  in whole device pixels.
- **Commands.** Focus, blur and the keyboard's dismissal reach the mutation
  log, not a native state.

## How it works

`native/headless` holds the WebAssembly bindings: `LayoutWasm.cpp` is the
layout engine's (`native/shared/layout`), shaped like the Android one, and
`BatchWasm.cpp` decodes a batch with `Wire.h` and checks it against a
`ViewTable`, as a shell does, and reads `.krec` files with `Recording.h`.
`headless.wasm` is checked in, with the hash of what it was built from in
`headless.json`; `test/headless-layout.test.ts` fails when the C++ changes
without a rebuild:

```bash
node scripts/build-headless-wasm.ts
```

downloads the pinned wasi-sdk into `~/.cache/kuito` once and rebuilds it.
The host (`src/tests`) runs the kernel and the UI-thread kernel in `node:vm`
contexts, and its renderer lays out pages, sheets and list rows as roots of
their own, pads safe areas and binds list rows as the iOS renderer does.
