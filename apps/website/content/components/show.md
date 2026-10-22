# Show

`Show` renders its children while `when` is truthy, and `fallback` otherwise. When `when` changes, only that branch renders again: the rest of the screen is left as it was.

Use it for:

- a signed-in screen or a sign-in prompt;
- a panel the user opens and closes;
- content that needs a value that may be missing.

```tsx
import { Button, Show, Text, VStack, signal } from 'kuito';

export default function Details() {
  const open = signal(false);

  return (
    <VStack padding={16} gap={8}>
      <Button onPress={() => (open.value = !open.value)}>Details</Button>
      <Show when={open.value}>
        <Text>Recorded live in 2019.</Text>
      </Show>
    </VStack>
  );
}
```

## Patterns

### Use the value when it is there

A single callback child receives the truthy value, narrowed: no `!` or `?.` inside.

```tsx
import { Button, Show, Text, signal } from 'kuito';

type User = { name: string };

export default function Greeting() {
  const user = signal<User | null>(null);

  return (
    <Show
      when={user.value}
      fallback={<Button onPress={() => (user.value = { name: 'Ada' })}>Sign in</Button>}
    >
      {(signedIn) => <Text>{`Hi ${signedIn.name}`}</Text>}
    </Show>
  );
}
```

### Animate the branch in and out

A view that mounts plays its `enter` effect, and one that unmounts its `exit` effect ([motion](../guides/motion.md)).

```tsx
import { Show, Text, fade, signal } from 'kuito';

export default function Toast() {
  const visible = signal(true);

  return (
    <Show when={visible.value}>
      <Text enter={fade} exit={fade} onPress={() => (visible.value = false)}>
        Saved
      </Text>
    </Show>
  );
}
```

## Platform differences

None: Show is resolved before anything reaches the platform.

## Related

- [Switch](./switch.md), for more than two branches
- [Control flow](../language/control-flow.md)
