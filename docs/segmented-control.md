# SegmentedControl

Choose one of a few visible options. Use it for a time range, filter or display mode.

## Switch between day, week and month

```tsx
import { SegmentedControl, Text, VStack, signal } from 'kuito';

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export default function Plan() {
  const view = signal('week');

  return (
    <VStack gap={8} padding={16}>
      <SegmentedControl label="View" options={VIEWS} value={view} height={32} />
      <Text>{view.value}</Text>
    </VStack>
  );
}
```

## Behavior

Each option has a value and label; `value` holds the selected identifier. Keep labels short and the option count small. Use Select when the choices need more room.

## Continue

Read [Reactivity](reactivity.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/SegmentedControl#members) for types and documented defaults.
