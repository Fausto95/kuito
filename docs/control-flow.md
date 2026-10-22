# Control flow

Structure that depends on state — showing a panel, picking a tab — uses
`Show`, `Switch`, `Match` and `For` from `kuito`, after Solid's components;
`Catch` shows a fallback for children that throw, and `Loading` one while
their resources load.
A reactive child expression (`{open.value ? <Panel /> : null}`) works too.

```tsx
import { Match, Show, Switch, Text, VStack, signal } from 'kuito';

const user = signal<{ name: string } | null>(null);
const tab = signal<'home' | 'search' | 'inbox'>('home');

export function Header() {
  return (
    <VStack>
      <Show when={user.value} fallback={<Text>Sign in to continue</Text>}>
        {(user) => <Text>Hi {user.name}</Text>}
      </Show>
      <Switch fallback={<Text>Nothing here yet</Text>}>
        <Match when={tab.value === 'home'}>
          <Text>Home</Text>
        </Match>
        <Match when={tab.value === 'search'}>
          <Text>Search</Text>
        </Match>
      </Switch>
    </VStack>
  );
}
```

- `Show` renders its children while `when` is truthy, otherwise `fallback`. A
  single callback child receives the truthy value.
- `Switch` renders the first `Match` whose `when` is truthy, otherwise
  `fallback`. `Match` must be a direct child of `Switch`; its children may also
  be a callback.
- `Switch` is control flow. The native on/off control is `Toggle`
  (React Native's `Switch`), so one file can use both.

## For

`For` renders a row per item of `each` (an array, a signal of one, or a
[store](reactivity.md#stores) array), for lists that are not virtualized, such
as a few dozen rows in a `Scroll`. A long list belongs in `List`
([lists.md](lists.md)).

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title + (task.done ? ' ✓' : '')}</Text>}
  </For>
</Scroll>;
```

- Rows are keyed by item: an object by its identity (a store's objects keep
  theirs wherever they move), a string or number by its value, numbered where
  it repeats. A reorder moves the rows' views; no view is created again.
- A row renders once per item. When `each` changes, a row whose item stayed
  returns the tree it rendered, so its bindings are not evaluated again;
  `index` is a signal that follows the row's position.
- `fallback` renders while `each` is empty.
- Its one child is the function that renders a row.

## Catch

`Catch` renders its children until they throw, then its `fallback` in their
place. The rest of the screen stays as it was.

```tsx
import { Button, Catch, Text, VStack, resource } from 'kuito';

function Profile() {
  const profile = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/me', { signal });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as { name: string };
  });

  return <Text>{profile.data.value?.name ?? ''}</Text>;
}

<Catch
  fallback={(error, retry) => (
    <VStack>
      <Text>{'Could not load: ' + String(error)}</Text>
      <Button onPress={retry}>Try again</Button>
    </VStack>
  )}
>
  <Profile />
</Catch>;
```

It takes what a component under it throws:

- while it renders, on the first render or when a branch inside it re-plans.
  The plan that threw commits nothing, and is planned again with the `Catch`
  showing its fallback;
- in an `effect`, a `watch` callback or `onMount`;
- in the load a `resource` starts on mount, when its component does not
  render `error`. A component that reads `error` in what it renders handles
  its own failure, and the `Catch` never sees it. A failure of
  `refresh()` or of a `task`'s `run()` belongs to whoever called it: the
  promise rejects.

`fallback` is an element, or a function of the error and `retry`. `retry`
renders the children again from scratch: the children were unmounted when
the fallback showed, so their state starts over and their resources load
again. When several errors arrive before the fallback shows, it shows the
first and the others are reported. A throw in the fallback goes to the `Catch` around this one.

A `Catch` keeps its fallback across re-renders of the screen, and a patch
that fails elsewhere leaves it as it was. A Live Patch
brings new code, so every `Catch` in the patched module renders its children
again.

What no `Catch` takes reaches the reporting seam as before: a render error
fails the patch (the previous UI stays and the LogBox shows it), an effect's
error is reported where it ran, and a resource's failure its component does
not render is reported with the resource's hook. An event handler's throw is not a
render error and never reaches a `Catch`.

A `Catch` is found by its place in the tree, so one whose place changes
on every render (inside a `For` row keyed by a new object each time) cannot
keep a fallback: after 100 such attempts the patch fails with the error,
and a warning names the cause.

A `Catch` covers what its module renders. Each `List` row renders as a
module of its own ([lists](lists.md)): put a `Catch` inside the row to cover it.

## Loading

`Loading` shows its `fallback` until the resources its children start have
settled, then shows the children.

```tsx
import { Loading, Spinner, Text, resource } from 'kuito';

function Profile() {
  const profile = resource(() => fetch('https://example.com/me').then((r) => r.text()));

  return <Text>{profile.data.value ?? ''}</Text>;
}

function Feed() {
  const feed = resource(() => fetch('https://example.com/feed').then((r) => r.text()));

  return <Text>{feed.data.value ?? ''}</Text>;
}

<Loading fallback={<Spinner />}>
  <Profile />
  <Feed />
</Loading>;
```

- The children render and mount at once, hidden (`hidden`, so they take no
  space), so their resources start loading; the fallback stands beside them.
- It waits for every `resource` of a component under it, at any depth, but
  not for those under a `Loading` inside it, in its children or its
  fallback: that one handles them. A `task` is never waited for.
- A resource has settled once its load returns or throws, or is cancelled.
  A failure settles it too: the component, or a [`Catch`](#catch) around it,
  shows the error.
- Once it shows its children, it keeps showing them. A `refresh()`, or a
  resource that a branch inside mounts later, shows its progress through its
  own `running`.
- It counts the resources under it when it renders, and again once all of
  those have settled. One that a branch inside mounts while it waits is
  waited for too if it is still loading then; one that leaves while it
  waits no longer holds it.
- A view of the children keeps its own `hidden` and gets it back when they
  show.
- The children mount while hidden, so their `enter` effects play then,
  unseen: showing them does not animate them in.
- Like `Catch`, a `Loading` covers what its module renders, not `List` rows.

## How it updates

`when` conditions and reactive child expressions are evaluated with dependency
tracking while the view plan is built. Each `Show`, `Switch`, `For` and reactive
child expression owns its branch: when a signal its condition read changes, only
that branch is planned again, in a microtask (several changes in one tick share
one re-plan), from the elements the module last rendered. The rest of the
screen is not walked, its bindings are not evaluated, and its subscriptions
stay. A branch inside another belongs to the innermost owner; when both change
in one tick, the outer one re-plans and takes the inner along. Component state
is kept, retained views are reused, and only what the branch changed is
unmounted and mounted. Unmounted views play their `exit` effect; mounted views
play `enter` ([motion](motion.md)).

A signal read by a structural decision outside any owner (a `Scroll`'s
`horizontal`, a gesture option at the module's root) re-plans the whole module,
through the same path as Live Patch. So does a branch that cannot re-plan
alone: one whose plan throws, or, on a host that cannot move views, one that
would recreate the siblings after it.

A component instance is its place in the tree, its component and its `key`, as
in React. A branch that unmounts drops its instances' state and cleans up their
lifecycle; showing it again mounts new instances that start from their initial
state and run `onMount` again. Rendering another component, or the same one
with another `key`, in the same place mounts a new instance too.

Property bindings (`opacity={count.value > 0 ? 1 : 0.5}`) stay fine-grained and never re-plan. A
failed re-plan commits nothing — the previous UI remains — and is reported once
through the runtime's error seam, unless a [`Catch`](#catch) around the
failure takes it.
