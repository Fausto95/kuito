# Focus, scroll and call view methods

Use a ref for an imperative action on a mounted view. Prefer props and signals for the state a view displays.

## Focus a field from an action

Create the ref during component setup and attach it to one view. Read current at the moment you act: it is null before mounting and after removal.

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

## Scroll after adding content

Use a typed ScrollHandle or ListHandle for scrolling methods. A List ref is assigned after the parent’s mount callback, so use initialIndex for initial positioning or invoke its methods from a later interaction.

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

## Choose the handle type

ref defaults to ElementHandle: focus and blur for a text field, setProperty, its parent and children, and addEventListener, removeEventListener and dispatchEvent ([listen from a ref](events.md#listen-from-a-ref)). ScrollHandle adds scrollTo and scrollToEnd; ListHandle adds scrollToIndex and scrollToItem. Camera, Video and WebView provide typed ref helpers and readiness information. Use those helpers for native view methods.

## Avoid stale handles

A ref follows one view. Do not cache current outside the operation that uses it. setProperty writes a native prop until its reactive binding updates again; use a signal for persistent state. A handle's event listeners go with its view: removing the view removes them.

## Continue

See [events](events.md), [Camera](camera.md), [Video](video.md) and [WebView](webview.md).
