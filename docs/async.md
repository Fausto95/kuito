# Load data and run async actions

Use `resource` to load when a component mounts. Use `task` for work triggered
by the user, such as saving a form. Both expose `running`, `data` and `error`
signals, and cancel work when their component is disposed.

## Load a profile with loading and error states

```tsx
import { Button, Text, VStack, resource } from 'kuito';

export function Profile() {
  const profile = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api/profile', { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as { name: string };
  });

  return (
    <VStack gap={12}>
      <Text>{profile.running.value ? 'Loading profile…' : (profile.data.value?.name ?? '')}</Text>
      <Text>{profile.error.value ? 'Could not load your profile.' : ''}</Text>
      <Button
        disabled={profile.running.value}
        onPress={() => void profile.refresh().catch(() => {})}
      >
        Refresh
      </Button>
    </VStack>
  );
}
```

Replace the example URL with your endpoint. `fetch` resolves for HTTP errors,
so check `response.ok` before reading the body. The response shape assertion
here assumes your server's contract; validate untrusted JSON in a real app.

Automatic resource failures populate `error`. Reading it in the rendered UI
makes this component responsible for displaying the failure. Otherwise a parent
`Catch` can show a fallback. `Loading` can coordinate the initial loading state
of several child resources. See [conditional UI](control-flow.md).

## Submit once while a request is in flight

```tsx
import { Button, Text, TextField, VStack, signal, task } from 'kuito';

export function Rename() {
  const name = signal('');
  const save = task(
    async ({ signal }, value: string) => {
      const response = await fetch('https://example.com/api/profile', {
        method: 'PATCH',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return value;
    },
    { policy: 'drop' },
  );

  return (
    <VStack gap={12}>
      <TextField label="Name" value={name} />
      <Button
        disabled={save.running.value || !name.value.trim()}
        onPress={() => void save.run(name.value).catch(() => {})}
      >
        {save.running.value ? 'Saving…' : 'Save'}
      </Button>
      <Text>{save.error.value ? 'Save failed. Try again.' : ''}</Text>
    </VStack>
  );
}
```

`run(...args)` and `refresh()` return promises that reject on failure. The
examples catch those rejections because their error signals are displayed.
Do not discard a rejecting promise without handling it.

| Policy              | Use case                    | Behavior                                                     |
| ------------------- | --------------------------- | ------------------------------------------------------------ |
| `replace` (default) | Search as the query changes | Cancels the previous run; only the newest result commits     |
| `drop`              | Save or submit button       | Reuses the in-flight promise instead of starting another run |

## Cancellation and lifetime

Pass the supplied abort signal to `fetch` and other cancellable operations.
Call `cancel()` to stop sooner. Cancellation cannot undo a server-side action;
make important server writes safe to retry. A stale non-cancellable result
cannot replace a newer result.

Resources start after a successful mount commit. Compatible Live Patches keep
the state signal objects while invalidating old work. A rejected patch leaves
the existing work active. `async`/`await` is supported; async generators are not
supported by the pinned Hermes runtime.
