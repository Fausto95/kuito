# For

Render a short collection while preserving item identity. Use it for tags, checklist rows and small menus.

## Show a checklist with row numbers

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

## Behavior

`each` accepts an array, array signal or store array. `index` is a signal. Every item is mounted; choose List when the collection needs virtualization. `fallback` handles an empty collection.

## Continue

Read [Control flow](control-flow.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/For#members) for types and documented defaults.
