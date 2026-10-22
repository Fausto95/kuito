# Select

Choose one item from a native menu. Use it for longer option lists that should not occupy the whole screen.

## Choose a size

```tsx
import { Select, Text, VStack, signal } from 'kuito';

const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
];

export default function Size() {
  const size = signal<string | undefined>(undefined);

  return (
    <VStack gap={8} padding={16}>
      <Select label="Size" options={SIZES} value={size} placeholder="Choose a size" height={44} />
      <Text>{size.value ?? 'No size yet'}</Text>
    </VStack>
  );
}
```

## Behavior

Options have stable `value` identifiers and human-readable labels. Bind the selected value to a signal. Use `undefined` with a placeholder for an unselected state. The accessible label should describe what is being chosen.

## Continue

Read [Reactivity](reactivity.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Select#members) for types and documented defaults.
