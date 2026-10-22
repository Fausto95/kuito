# Reactivity

A signal holds a value that changes; JSX that reads it follows it, and the component function does not run again.

**Use it for**

- State a screen shows: a counter, a form field, a selected tab.
- Values derived from others, computed once per change.
- Shared data whose every field updates the views that read it alone.

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

export function Counter() {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);

  watch(count, (next, previous) => console.log(previous, '->', next));

  return (
    <Pressable onPress={() => count.value++}>
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)` made while a component sets up belongs to that component and keeps its value across Live Patches; made anywhere else it is a signal of its own.
- `computed(fn)` is a read-only signal of what `fn` returns, computed on first read and again only once a signal it read changed.
- `watch(source, fn)` runs `fn(next, previous)` when the signal, or what the function `source` reads, changes. In a component it ends when the component unmounts; elsewhere it runs from now on. `remove()` on what it returns stops it sooner.
- `effect(fn)` runs `fn` again whenever what it read changes.

Writes batch themselves: everything one event writes reaches the screen together, and a read right after a write sees it.

## Pass a signal as a prop

A prop takes a value or a signal: `opacity={level}` follows `level`, as `opacity={level.value}` does, because the compiler makes every JSX expression reactive. A function in a prop is always a handler, so write the expression, or derive a signal with `computed(() => ...)`.

A `.value` read in a component's body, outside JSX and outside any function, sees the first value only, because the component sets up once. The compiler warns about it with the file and line.

## Read a component's props

A component reads its props as values, as in React: `props.show.name`. Where it reads them decides what updates:

- Inside JSX (`<Text>{props.count}</Text>`), the read stays reactive: the text follows the signal behind the prop.
- In the component body, or destructured (`function Label({ count })`), the prop is read once, when the component renders.

## Share data with a store

`store(initial)` makes an object or an array whose every path is a signal:

```tsx
import { Pressable, Text, store } from 'kuito';

const shelf = store({ books: [{ id: 1, title: 'Dune', liked: false }] });

export function Book() {
  return (
    <Pressable onPress={() => (shelf.books[0].liked = true)}>
      <Text>{shelf.books[0].liked ? '♥' : '♡'}</Text>
    </Pressable>
  );
}
```

- A read through the store tracks that path alone: the label above follows `books[0].liked`, and a write to `books[0].title` leaves it alone.
- Array methods (`push`, `splice`, `sort`) write through it too.
- It wraps `initial` rather than copying it. Write through the store: a change made to the plain object directly reaches nobody.
- Plain objects and arrays inside it are stores too; class instances, dates and maps are values.

## Give a whole subtree a value

`inherited(fallback)` makes a key, once, at the top of a module. A component `provide`s a value for it, and every component below reads it with `inherit`, without passing it through the ones between:

```tsx
import { Pressable, Text, VStack, inherit, inherited, provide, signal } from 'kuito';

export const Accent = inherited('#8bc6ff');

function Badge() {
  const accent = inherit(Accent);
  return <Text color={accent.value}>New</Text>;
}

export function Screen() {
  const accent = signal('#ffb86b');
  provide(Accent, accent);

  return (
    <VStack>
      <Badge />
      <Pressable label="Recolor" onPress={() => (accent.value = '#ff79c6')} />
    </VStack>
  );
}
```

A signal provided is the signal readers get: a write reaches only the bindings that read it.

## Related

- [Control flow](../language/control-flow.md): `Show`, `Switch` and `For`
- [Lists](./lists.md): rows over a store array
- [Architecture](../architecture.md#reactivity): batching, branch planning and hook identity
- [Reactivity in depth](../../../../docs/reactivity.md): expression identity across patches and the full hook naming rules
