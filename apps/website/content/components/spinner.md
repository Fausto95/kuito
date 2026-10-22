# Spinner

`Spinner` is the platform's indeterminate progress indicator: a `UIActivityIndicatorView` on iOS, a `ProgressBar` on Android. It spins while `animating` is true, which it is by default.

Use it for:

- a screen or a section that is loading;
- a button's pending state;
- the footer of a list that loads more.

```tsx
import { Spinner, VStack } from 'kuito';

export default function Loading() {
  return (
    <VStack flex={1} justifyContent="center" alignItems="center">
      <Spinner />
    </VStack>
  );
}
```

## Patterns

### Show it while resources load

[Loading](./loading.md) shows its fallback until the resources its children start have settled.

```tsx
import { Loading, Spinner, Text, resource } from 'kuito';

function Profile() {
  const user = resource(
    async () => (await fetch('https://example.com/me')).json() as Promise<{ name: string }>,
  );

  return <Text>{user.data.value?.name ?? ''}</Text>;
}

export default function Account() {
  return (
    <Loading fallback={<Spinner />}>
      <Profile />
    </Loading>
  );
}
```

### Follow a task

```tsx
import { Button, HStack, Spinner, task } from 'kuito';

export default function Sync(props: { sync: () => Promise<void> }) {
  const sync = task(() => props.sync());

  return (
    <HStack gap={8} alignItems="center">
      <Button onPress={() => void sync.run()}>Sync</Button>
      <Spinner animating={sync.running.value} />
    </HStack>
  );
}
```

## Platform differences

Each platform draws its own indicator, with its own size and color.

## Accessibility

A screen reader reads it as a progress indicator. Tell the user what is loading with a `label` when the screen says nothing else.

## Related

- [Loading](./loading.md)
- [Reactivity](../../../../docs/reactivity.md), for `task` and `resource`
