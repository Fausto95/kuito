# Loading

Wait for initial resources in a subtree before revealing it. Use it when several related pieces of a screen should appear together.

## Reveal a profile after its resource settles

```tsx
import { Catch, Loading, Spinner, Text, resource } from 'kuito';

function Profile() {
  const profile = resource(async ({ signal }) => {
    const response = await fetch('https://example.com/api/profile', { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as { name: string };
  });
  return <Text>{profile.data.value?.name ?? ''}</Text>;
}

export function Account() {
  return (
    <Catch fallback={<Text>Profile unavailable</Text>}>
      <Loading fallback={<Spinner />}>
        <Profile />
      </Loading>
    </Catch>
  );
}
```

## Behavior

Children mount while hidden so their resources can start. Loading waits for resources, not tasks. It reveals children after settlement, including failure; pair it with Catch or an explicit error UI. Subsequent refreshes use each resource’s running state.

## Continue

Read [Async](async.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Loading#members) for types and documented defaults.
