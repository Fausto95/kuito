# Divider

Separate adjacent sections with a thin native view. Use it between settings rows or list items.

## Separate account and notification settings

```tsx
import { Divider, Text, VStack } from 'kuito';

export default function Settings() {
  return (
    <VStack>
      <Text padding={16}>Account</Text>
      <Divider />
      <Text padding={16}>Notifications</Text>
    </VStack>
  );
}
```

## Behavior

The divider has a minimum one-point height. Set color and other common view props explicitly when the default does not fit your theme. Pass it as `List.separator` to separate recycled rows.

## Continue

Read [Lists](lists.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Divider#members) for types and documented defaults.
