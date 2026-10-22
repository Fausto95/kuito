# SafeArea

Lay out content inside the usable screen area. Use it for screens that draw behind a notch, status bar or home indicator.

## Keep a screen title clear of system UI

```tsx
import { SafeArea, Text } from 'kuito';

export default function Home() {
  return (
    <SafeArea flex={1} padding={16}>
      <Text fontSize={28} fontWeight="bold">
        Library
      </Text>
    </SafeArea>
  );
}
```

## Behavior

SafeArea is a vertical stack with inset padding. `edges` selects the edges to protect. Avoid applying the same inset in both a parent and child. System bar appearance is controlled by `SystemBars`.

## Continue

Read [Window](window.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/SafeArea#members) for types and documented defaults.
