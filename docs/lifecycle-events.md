# Component lifetime and cleanup

Use lifecycle helpers for subscriptions, timers and native work that should
exist only while a component is mounted. Create them during component setup.

## Start and stop a timer

```tsx
import { Text, onMount, signal } from 'kuito';

export function ElapsedTime() {
  const seconds = signal(0);
  onMount(() => {
    const timer = setInterval(() => seconds.value++, 1000);
    return () => clearInterval(timer);
  });
  return <Text>{`${seconds.value} seconds on this screen`}</Text>;
}
```

`onMount` runs after a successful native mount. Its returned cleanup runs when
the component is disposed and before an accepted refresh reruns the mount work.
A failed patch does not tear down the current component.

## Tie a side effect to state

```tsx
import { Text, effect, onCleanup, signal } from 'kuito';

export function Connection(props: { connect: (room: string) => () => void }) {
  const room = signal('general');
  effect(() => {
    const disconnect = props.connect(room.value);
    return disconnect;
  });
  onCleanup(() => console.log('Connection screen disposed'));
  return <Text>{`Connected to ${room.value}`}</Text>;
}
```

`effect` tracks reads made synchronously in its callback. A dependency change
cleans up the previous run before starting another. Reads after `await` do not
establish dependencies. Use `watch` when you want to choose the dependency
explicitly, and [task/resource](async.md) for async work and cancellation.

`onCleanup` registers a disposal callback when there is no corresponding start
operation. Do not put lifecycle registration in an event handler and expect
it to acquire the component's setup scope.

## Screen visibility is different from mounting

Pushing another route or switching tabs usually keeps the previous screen
mounted. A mounted timer can therefore continue behind another screen. Use
the app's state or route state when work depends on visibility, and use
`watch(app.state, ...)` for foreground/background transitions.

Native subscriptions created during component setup are generally scoped to
that component; subscriptions created elsewhere must be removed explicitly.
Check the API's returned handle for `remove()`. See [app state](app-state.md).
