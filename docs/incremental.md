# How Live Patch preserves state

Live Patch updates a running development app after a source edit. It retains compatible component state and native views so you can continue the interaction you are testing.

## Try a compatible edit

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export function Counter() {
  const count = signal(0);
  return (
    <VStack>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Add</Button>
    </VStack>
  );
}
```

Increment the counter, change “Count” to “Total”, and save. The changed component executes with its existing named `count` slot. Renaming that variable changes the slot identity and resets its state. Removing the component releases its state and resources.

## Decide what executes again

The compiler assigns stable identities to named components and fingerprints their syntax and the module statements they read. Editing a local helper or constant invalidates dependent components. Comments, formatting and quote style do not affect that fingerprint.

Unchanged components with unchanged prop identity reuse their descriptor trees. Child definitions resolve through the current registry, so editing a child need not rerun its parent. A component instance is identified by its place, definition and key; changing any of those can create a new instance.

## Preserve lifetimes

Named hook slots, refs, state and instance-lifetime mount records survive while the instance remains compatible. When a component executes again, its effect/watch scopes and asynchronous work are replaced. Removed hooks and components dispose their work. Unchanged scopes remain active.

Keep side effects in lifecycle hooks or tasks rather than component bodies. Host mutations are not generally reversible, and a component can execute again during a patch.

## Know the limits

Rolldown still regenerates the bundle; this is component-level reuse rather than an incremental bundler. An imported constant edited in another file may remain cached until its consuming module changes. Props use shallow `Object.is` comparison, so mutate-by-reference patterns can hide changes. Anonymous/unidentified compositions can reexecute, and unkeyed reordered children can change identity.

Use a full reload when testing startup or when an edit is outside the compatibility model. Spec/native source changes rebuild the shell. A rejected patch reports through [LogBox](logbox.md) and keeps the previous app version available.
