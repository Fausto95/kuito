# Respond to app state

Refresh data when the app becomes active, pause foreground work in the background, and release expendable caches on memory warnings.

## Refresh on return and release cached data

```tsx
import { Button, app, watch } from 'kuito';

declare function refresh(): void;

const cache = new Map<string, ArrayBuffer>();

app.state.value; // 'active' | 'background' | 'inactive'

export function Feed() {
  // Both follow the platform until the component unmounts.
  watch(app.state, (state) => {
    if (state === 'active') refresh();
  });
  app.watch('memoryWarning', () => cache.clear());

  return <Button onPress={() => void app.openSettings()}>Open Settings</Button>;
}
```

## Behavior and limits

`app.state` is a signal with `active`, `inactive` and `background`. Inactive means visible but not receiving normal interaction, such as when system UI covers the app. Use `watch(app.state, ...)` for transitions. `app.watch` accepts `memoryWarning`, not a generic change event. Component-scoped subscriptions stop on unmount; remove subscriptions created outside a component yourself. Memory warnings are not guaranteed, so bound cache sizes independently.

## Continue

Read [Lifecycle events](lifecycle-events.md) for the related workflow. The API reference lists every method, option, event and return type.
