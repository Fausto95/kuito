# ContextMenu

Attach a native action menu to content. Use it for secondary actions on a row, photo or card.

## Offer actions for an episode

```tsx
import { ContextMenu, Text, VStack } from 'kuito';

const ITEMS = [
  { value: 'share', label: 'Share' },
  { value: 'played', label: 'Mark played' },
  { value: 'delete', label: 'Delete', destructive: true },
];

export default function Episode() {
  return (
    <ContextMenu title="Episode 4" items={ITEMS} onSelect={(event) => console.log(event.value)}>
      <VStack padding={12}>
        <Text>Episode 4</Text>
      </VStack>
    </ContextMenu>
  );
}
```

## Behavior

Items use stable values; `onSelect` reports the chosen value. Mark destructive actions explicitly. The menu wraps its trigger content and opens with the platform context-menu interaction.

## Continue

Read [Action sheet](action-sheet.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/ContextMenu#members) for types and documented defaults.
