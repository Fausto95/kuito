# TextField

Collect editable text. Use it for search, account details and forms.

## Bind a search field to state

```tsx
import { TextField, VStack, signal, Text } from 'kuito';

export default function Search() {
  const query = signal('');

  return (
    <VStack padding={16} gap={8}>
      <TextField label="Search" placeholder="Artists, albums" type="search" value={query} />
      <Text>{query.value}</Text>
    </VStack>
  );
}
```

## Behavior

Pass a signal as `value` for two-way input. Choose `type` for the keyboard and input purpose. A `label` remains useful to accessibility even when a placeholder disappears. Use `format` for input formatting, and show validation feedback beside the field.

## Continue

Read [Keyboard](keyboard.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/TextField#members) for types and documented defaults.
