# For

`For` renders a row per item of `each`: an array, a signal of one, or a store array. Rows are keyed by item, so a reorder moves their views and a row renders once per item.

Use it for:

- a few dozen rows in a `Scroll`;
- the options of a form, the tags of a post;
- items of a store that change one at a time.

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

export default function Tasks() {
  return (
    <Scroll>
      <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
        {(task, index) => <Text>{index.value + 1 + '. ' + task.title}</Text>}
      </For>
    </Scroll>
  );
}
```

Its one child is the function that renders a row; `index` is a signal that follows the row's position. A long list belongs in a [List](./list.md), which renders only what is near the screen.

## Patterns

### Change one item

Over a store array, a field write reaches only the bindings that read it: the row stays, its other views untouched.

```tsx
import { For, Pressable, Text, VStack, store } from 'kuito';

const todo = store({ tasks: [{ id: 't1', title: 'Write', done: false }] });

export default function Checklist() {
  return (
    <VStack>
      <For each={todo.tasks}>
        {(task) => (
          <Pressable padding={12} onPress={() => (task.done = !task.done)}>
            <Text>{(task.done ? '✓ ' : '') + task.title}</Text>
          </Pressable>
        )}
      </For>
    </VStack>
  );
}
```

### Reorder without recreating views

Objects are keyed by identity (a store's objects keep theirs wherever they move), strings and numbers by value. Sorting moves the rows' views.

```tsx
import { Button, For, Text, VStack, signal } from 'kuito';

export default function Names() {
  const names = signal(['Ada', 'Grace', 'Alan']);

  return (
    <VStack>
      <Button onPress={() => (names.value = [...names.value].sort())}>Sort</Button>
      <For each={names}>{(name) => <Text>{name}</Text>}</For>
    </VStack>
  );
}
```

## Platform differences

None: For is resolved before anything reaches the platform.

## Related

- [List](./list.md)
- [Reactivity](../guides/reactivity.md), for stores
- [Control flow](../language/control-flow.md)
