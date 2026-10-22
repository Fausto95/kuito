# State and derived values

Use `signal` for a value that changes, `computed` for a value calculated from
other state, and `store` for an object or array with independently changing
fields. JSX reads subscribe to those values; a component's setup does not run
again after each write.

## Calculate a cart total

```tsx
import { Button, Text, VStack, computed, signal } from 'kuito';

export function Cart() {
  const quantity = signal(1);
  const total = computed(() => quantity.value * 12);

  return (
    <VStack gap={12}>
      <Text>{`${quantity.value} tickets: €${total.value}`}</Text>
      <Button onPress={() => quantity.value++}>Add a ticket</Button>
    </VStack>
  );
}
```

Read and write `signal.value`. A computed value is read-only and recalculates
after a dependency changes when it is next read. Multiple writes in one event
are batched for rendering; a read immediately after a write sees the new value.

## Keep reads reactive

| Read location               | Behavior                                           |
| --------------------------- | -------------------------------------------------- |
| JSX expression              | Updates when the values it reads change            |
| `computed(() => ...)`       | Tracks dependencies and derives another signal     |
| `watch(source, callback)`   | Calls the callback when the selected value changes |
| Component body, outside JSX | Runs once at setup; the result is a snapshot       |

Pass a signal directly to a compatible prop, or read `.value` in JSX. A function
prop is a callback, not a request to track its return value. Keep reactive props
as `props.name` in JSX instead of destructuring them during setup.

## Update fields in a collection

```tsx
import { For, Pressable, Text, VStack, store } from 'kuito';

export function Checklist() {
  const list = store({ items: [{ title: 'Passport', packed: false }] });
  return (
    <VStack>
      <For each={list.items}>
        {(item) => (
          <Pressable onPress={() => (item.packed = !item.packed)}>
            <Text>{`${item.packed ? 'Packed' : 'Pack'}: ${item.title}`}</Text>
          </Pressable>
        )}
      </For>
    </VStack>
  );
}
```

Store reads track the path used. `push`, `splice` and `sort` work through the
store, preserving object identities. Write through the store rather than the
original object. Plain objects and arrays are reactive; dates, maps and class
instances remain values. For a long collection use [List](lists.md).

## React to a change outside the UI

```tsx
import { TextField, signal, watch } from 'kuito';

export function Search(props: { search: (query: string) => void }) {
  const query = signal('');
  watch(query, (text) => {
    const timer = setTimeout(() => props.search(text), 250);
    return () => clearTimeout(timer);
  });
  return <TextField label="Search" value={query} />;
}
```

`watch` passes the next and previous values. `{ immediate: true }` also runs it
initially. The returned subscription has `remove()`. A cleanup returned from
the callback runs before the next callback and on disposal. In component setup,
the watcher belongs to the component; outside setup, remove it yourself.
Use `effect` when the callback itself should select its synchronous dependencies.

## Share a value with descendants

```tsx
import { Text, VStack, inherit, inherited, provide, signal } from 'kuito';

const Currency = inherited('EUR');

function Price() {
  const currency = inherit(Currency);
  return <Text>{`12 ${currency.value}`}</Text>;
}

export function Checkout() {
  const currency = signal('USD');
  provide(Currency, currency);
  return (
    <VStack>
      <Price />
    </VStack>
  );
}
```

Declare the key once at module scope. The nearest provider supplies the value;
without one, descendants read the fallback. A provided signal remains reactive.
Module-level signals and stores are another option for app-wide state.

Component-owned state survives compatible Live Patches and ends when the
component unmounts. Use [persisted state](storage.md) to survive app restarts and
[tasks and resources](async.md) for asynchronous work.
