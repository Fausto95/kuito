# Spinner

Show that work is in progress when its duration is unknown. Use it next to a loading label or as a Loading fallback.

## Center an activity indicator

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

## Behavior

A spinner communicates activity, not completion percentage. Hide it when the operation settles and provide an error state when it fails. `animating` controls whether it spins.

## Continue

Read [Async](async.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Spinner#members) for types and documented defaults.
