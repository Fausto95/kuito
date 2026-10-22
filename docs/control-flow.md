# Conditional UI and repeated content

Use `Show` for one condition, `Switch` and `Match` for several alternatives,
and `For` for a short collection. Use `Loading` and `Catch` around content that
loads or may fail.

## Show a signed-in or signed-out view

```tsx
import { Button, Show, Text, VStack, signal } from 'kuito';

export function Account() {
  const user = signal<{ name: string } | null>(null);
  return (
    <VStack gap={12}>
      <Show when={user.value} fallback={<Text>Sign in to save your list.</Text>}>
        {(person) => <Text>{`Welcome, ${person.name}`}</Text>}
      </Show>
      <Button onPress={() => (user.value = { name: 'Ada' })}>Try the signed-in view</Button>
    </VStack>
  );
}
```

A callback child receives the truthy value, so it can safely read `person.name`.
Changing branches mounts the new content and disposes the old content. A JSX
ternary also works for simple conditions.

## Select one of several states

```tsx
import { Match, Switch, Text, signal } from 'kuito';

export function Status() {
  const state = signal<'loading' | 'offline' | 'ready'>('loading');
  return (
    <Switch fallback={<Text>Ready</Text>}>
      <Match when={state.value === 'loading'}>
        <Text>Loading…</Text>
      </Match>
      <Match when={state.value === 'offline'}>
        <Text>Check your connection</Text>
      </Match>
    </Switch>
  );
}
```

Only the first matching branch renders. `Match` belongs directly under `Switch`.
The native on/off input is named `Toggle`.

## Render a short checklist

```tsx
import { For, Scroll, Text, store } from 'kuito';

export function PackingList() {
  const state = store({ items: [{ title: 'Passport' }, { title: 'Tickets' }] });
  return (
    <Scroll>
      <For each={state.items} fallback={<Text>Add your first item</Text>}>
        {(item, index) => <Text padding={12}>{`${index.value + 1}. ${item.title}`}</Text>}
      </For>
    </Scroll>
  );
}
```

`For` renders every item; use [List](lists.md) for a feed or large collection.
Object identity identifies a row, while primitive items use their values.
Reordering existing objects moves their views. `index` is a signal because
the row's position can change.

## Coordinate loading and retry

```tsx
import { Button, Catch, Loading, Spinner, Text, VStack, resource } from 'kuito';

function Summary() {
  const result = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api/summary', { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  });
  return <Text>{result.data.value ?? ''}</Text>;
}

export function Dashboard() {
  return (
    <Catch
      fallback={(_error, retry) => (
        <VStack>
          <Text>Could not load the summary.</Text>
          <Button onPress={retry}>Retry</Button>
        </VStack>
      )}
    >
      <Loading fallback={<Spinner />}>
        <Summary />
      </Loading>
    </Catch>
  );
}
```

`Loading` waits for initial child resources, then keeps the content visible.
Later refreshes use each resource's `running` state. Failures also settle a
resource; a `Catch` or the component itself must display the error.

`Catch` covers render and lifecycle failures and unhandled automatic resource
loads. It does not catch event-handler errors or rejected `task.run()` and
`resource.refresh()` promises. Handle those where you call them. Retrying a
boundary mounts fresh children with fresh state. Put a boundary inside a
`List` row to cover that row's independent rendering scope.
