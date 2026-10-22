# Control flow

Structure that depends on state, showing a panel or picking a tab, uses `Show`, `Switch`, `Match` and `For` from `kuito`; `Catch` and `Loading` stand in for children that fail or are still loading. A reactive child expression (`{open.value ? <Panel /> : null}`) works too.

## Show

`Show` renders its children while `when` is truthy, otherwise `fallback`. A single callback child receives the truthy value.

```tsx
import { Button, Show, Text, signal } from 'kuito';

export function Greeting() {
  const user = signal<{ name: string } | null>(null);

  return (
    <Show
      when={user.value}
      fallback={<Button onPress={() => (user.value = { name: 'Ada' })}>Sign in</Button>}
    >
      {(user) => <Text>Hi {user.name}</Text>}
    </Show>
  );
}
```

## Switch and Match

`Switch` renders the first `Match` whose `when` is truthy, otherwise `fallback`. `Match` must be a direct child of `Switch`; its children may also be a callback. `Switch` is control flow: the native on/off control is `Toggle`, so one file can use both.

```tsx
import { Match, Switch, Text, signal } from 'kuito';

export function Tabs() {
  const tab = signal<'home' | 'search' | 'profile'>('home');

  return (
    <Switch fallback={<Text>Not found</Text>}>
      <Match when={tab.value === 'home'}>
        <Text>Home</Text>
      </Match>
      <Match when={tab.value === 'search'}>
        <Text>Search</Text>
      </Match>
    </Switch>
  );
}
```

## For

`For` renders a row per item of `each` (an array, a signal of one, or a [store](../../../../docs/reactivity.md#stores) array), for lists that are not virtualized, such as a few dozen rows in a `Scroll`. A long list belongs in [`List`](../../../../docs/lists.md). Its one child is the function that renders a row; `fallback` renders while `each` is empty.

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

export function Tasks() {
  return (
    <Scroll>
      <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
        {(task, index) => <Text>{index.value + 1 + '. ' + task.title}</Text>}
      </For>
    </Scroll>
  );
}
```

- Rows are keyed by item: an object by its identity, a string or number by its value. A reorder moves the rows' views; no view is created again.
- A row renders once per item. When `each` changes, a row whose item stayed returns the tree it rendered; `index` is a signal that follows the row's position.

## Catch and Loading

`Catch` shows a fallback in place of children that throw while they render or load, and `Loading` one until the resources its children start have settled.

```tsx
import { Button, Catch, Loading, Spinner, Text, VStack, resource } from 'kuito';

function Profile() {
  const user = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/me', { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as { name: string };
  });

  return <Text>{user.data.value?.name ?? ''}</Text>;
}

export function Account() {
  return (
    <Catch
      fallback={(error, retry) => (
        <VStack>
          <Text>{'Could not load: ' + String(error)}</Text>
          <Button onPress={retry}>Try again</Button>
        </VStack>
      )}
    >
      <Loading fallback={<Spinner />}>
        <Profile />
      </Loading>
    </Catch>
  );
}
```

`retry` renders the children again from scratch. An event handler's throw never reaches a `Catch`, and a component that renders its resource's `error` handles its own failure.

## How it updates

When a condition changes, only that branch updates; the rest of the screen keeps its views and its state. A branch that goes away drops its components' state: showing it again starts them fresh and runs `onMount` again. A prop that reads a signal (`opacity={count.value > 0 ? 1 : 0.5}`) updates that one prop and never touches the branch around it. How branches are planned is in [Architecture](../architecture.md#reactivity).

## In depth

[Control flow](../../../../docs/control-flow.md) covers nested branch ownership, what re-plans the whole module, and component identity.
