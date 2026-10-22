# Refs

A ref holds a view's element, its handle, so code can act on the view
directly: focus a field, scroll a list to an item, listen to its events,
call a native view's methods. Most of an app needs none: props and signals
describe what a view shows, and a ref is for what is an action rather than
state.

```tsx
import { Button, ref, TextField, VStack } from 'kuito';

function Search() {
  const field = ref();

  return (
    <VStack gap={8}>
      <TextField ref={field} placeholder="Search" />
      <Button onPress={() => field.current?.focus()}>Search</Button>
    </VStack>
  );
}
```

## Creating and attaching one

`ref<T>()` makes a ref, `{ current: T | null }`, typed as an
`ElementHandle` unless you name a handle type. Call it while a component
sets up, as with `signal()`: the component owns it, and the same ref, with
the same handle, survives the component's updates and a Live Patch that
keeps the view. Called outside a component's setup it throws `ref() must
run during component initialization`.

Pass it as a view's `ref` prop. A ref follows one view at a time; give each
view its own.

## When `current` is set

| Moment                                         | `current`                    |
| ---------------------------------------------- | ---------------------------- |
| While the component first sets up              | `null`                       |
| Once the update that creates the view lands    | The handle, before `onMount` |
| After that, in handlers, effects and `onMount` | The same handle              |
| Once the view is removed                       | `null` again                 |

The handle is assigned once the host has accepted the batch that made the
view, so the component's `onMount` and everything after it can use it. A
`ListHandle` is the exception: the List assigns it as the List itself
mounts, which is after the `onMount` of the component that renders it. Use
a List's ref from a handler, an effect or a later update, or give the List
`initialIndex` to start at an item. Read it where
you use it (`field.current?.focus()`) rather than keeping a copy: a copy
outlives its view, and a removed view's handle fails as below.

## Handles

The handle type depends on the view the ref is attached to.

| View                                      | Handle             | Adds                            |
| ----------------------------------------- | ------------------ | ------------------------------- |
| Any view                                  | `ElementHandle`    | The element                     |
| `Scroll`                                  | `ScrollHandle`     | `scrollTo`, `scrollToEnd`       |
| `List`                                    | `ListHandle`       | `scrollToIndex`, `scrollToItem` |
| A module's view (`Video`, `WebView`, ...) | `NativeViewHandle` | The methods its spec declares   |

### ElementHandle

| Member                                       | Does                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `id: string`                                 | The view's `id` prop, or the label the kernel generated for it               |
| `parent: ElementHandle \| null`              | The element of the view that holds it                                        |
| `children: ElementHandle[]`                  | The elements of the views it holds                                           |
| `focus(): void`, `blur(): void`              | Give or take the keyboard focus of a `TextField`                             |
| `setProperty(key, value): void`              | Sets a native prop on the view now, until its binding writes it again        |
| `addEventListener(type, fn, options?): void` | Listens to the view's events; `capture`, `once` and `signal` as in the DOM   |
| `removeEventListener(type, fn, options?)`    | Stops listening                                                              |
| `dispatchEvent(event): boolean`              | Sends an event through capture, target and bubble; false if it was cancelled |

`focus` and `blur` act on text fields only: on another view the renderer
fails with its `unsupportedProp` error. To move the screen reader rather than
the keyboard, pass the handle to `accessibility.focus`
([accessibility](accessibility.md#the-accessibility-module)). `setProperty`
writes outside the view's bindings, so the next update of a bound prop
overwrites it; prefer a signal for anything that is state. Listeners and
event phases are described in [lifecycle events](lifecycle-events.md).

### ScrollHandle

A `Scroll`'s ref holds a `ScrollHandle`: its element, and two methods.

```ts
import type { ElementHandle } from 'kuito';

interface ScrollHandle extends ElementHandle {
  scrollTo(
    params: { offset: number; animated?: boolean } | { page: number; animated?: boolean },
  ): void;
  scrollToEnd(params?: { animated?: boolean }): void;
}
```

`offset` is in points along the Scroll's axis; `page` is a whole view length
each from 0, where `paging` rests. Both animate unless `animated` is false,
and offsets past the end stop at the end. A request lands once the layout
has sized the content the same update brought, so appending a message and
calling `scrollToEnd` in one handler shows the new message.

```tsx
import { Button, For, ref, Scroll, signal, Text, VStack } from 'kuito';
import type { ScrollHandle } from 'kuito';

function Chat() {
  const messages = signal<string[]>([]);
  const thread = ref<ScrollHandle>();

  function send() {
    messages.value = [...messages.value, 'Message ' + (messages.value.length + 1)];
    thread.current?.scrollToEnd();
  }

  return (
    <VStack flex={1} gap={8}>
      <Scroll ref={thread} flex={1}>
        <For each={messages}>{(message) => <Text>{message}</Text>}</For>
      </Scroll>
      <Button onPress={send}>Send</Button>
    </VStack>
  );
}
```

More in [Scrolling from code](primitives.md#scrolling-from-code).

### ListHandle

A `List`'s ref holds a `ListHandle`: a `ScrollHandle` that also scrolls to
an item, by its index or by the item itself.

```ts
import type { ScrollHandle } from 'kuito';

interface ScrollToIndexOptions {
  index: number;
  animated?: boolean;
  /** Where the item lands: 0 at the start of the list, 0.5 centered, 1 at the end. */
  align?: number;
  /** Points to keep before the item, as CSS's `scroll-margin`. */
  margin?: number;
}

interface ListHandle extends ScrollHandle {
  scrollToIndex(params: ScrollToIndexOptions): void;
  scrollToItem(params: Omit<ScrollToIndexOptions, 'index'> & { item: unknown }): void;
}
```

`align` defaults to 0 and `margin` to 0; both animate unless `animated` is
false. `scrollToItem` finds the item in `data` by identity (`Object.is`).
Rows measure themselves, so the list needs no item sizes to land on a row
it has not shown yet. A list's rows are no pages: the renderer rejects a
List's `scrollTo({ page })` on both platforms. To start at an item rather than scroll to it, give the
List `initialIndex`.

```tsx
import { Button, List, ref, Text, VStack } from 'kuito';
import type { ListHandle } from 'kuito';

const CHAPTERS = Array.from({ length: 200 }, (_, index) => ({
  id: 'chapter-' + index,
  title: 'Chapter ' + (index + 1),
}));

function Contents() {
  const list = ref<ListHandle>();

  return (
    <VStack flex={1}>
      <Button onPress={() => list.current?.scrollToIndex({ index: 99, align: 0.5 })}>
        Chapter 100
      </Button>
      <List
        ref={list}
        flex={1}
        data={CHAPTERS}
        renderItem={({ item }) => <Text padding={12}>{item.title}</Text>}
      />
    </VStack>
  );
}
```

More in [List](primitives.md#list) and [how lists work](lists.md).

### A native view's handle

A view a native module contributes adds the methods its spec declares to
its element, each returning a Promise ([native views](native-modules.md#views)).
Views whose handle also holds state come with their own ref maker, called
where `ref()` would be: `videoRef()` ([video](video.md#the-ref)),
`webViewRef()` ([web view](webview.md)) and `cameraRef()`
([camera](camera.md)).

## Errors

| Call                                                                    | Fails with                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ref()` outside a component's setup                                     | `ref() must run during component initialization`                           |
| `setProperty`, `scrollTo`, `scrollToEnd` on a removed view              | `Detached native element`                                                  |
| `dispatchEvent` on a removed view                                       | `TypeError: Unknown event target`                                          |
| `focus` or `blur` on a removed view                                     | The renderer's `unsupportedProp` error: it finds no view                   |
| Any `ListHandle` member once the List is gone                           | `List is not on screen`                                                    |
| `scrollTo({ page })` with a page that is not a whole number from 0      | `TypeError: scrollTo takes a page from 0, not …`                           |
| `scrollTo({ offset })` with an offset that is not finite                | `TypeError: scrollTo takes an offset in points, not …`                     |
| `scrollToIndex` past the items, `scrollToItem` of an item not in `data` | `RangeError: List cannot scroll to index 7: no such item` (or `that item`) |
| A module view's method once its view is removed                         | A rejected Promise: `<View>.<method>: the view <id> is not mounted`        |
| `focus` or `blur` on a view that is not a text field                    | The renderer's `unsupportedProp` error                                     |
| `scrollTo({ page })` on a List                                          | The renderer's rejection: pages are a ScrollView's                         |

Reading `current?.` covers the moments a view is not there: before it
mounts, and after it is removed.
