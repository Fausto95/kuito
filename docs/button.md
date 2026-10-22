# Button

Run an action with the platform button. Use it for submit, retry and confirmation actions.

## Save without submitting twice

```tsx
import { Button, Text, VStack, task } from 'kuito';

export function SaveButton(props: { save: () => Promise<void> }) {
  const save = task(() => props.save(), { policy: 'drop' });
  return (
    <VStack gap={8}>
      <Button disabled={save.running.value} onPress={() => void save.run().catch(() => {})}>
        {save.running.value ? 'Saving…' : 'Save changes'}
      </Button>
      <Text>{save.error.value ? 'Save failed. Try again.' : ''}</Text>
    </VStack>
  );
}
```

## Behavior

`disabled` ignores interaction while work is in progress. Text children provide the title and accessible name. Use Pressable when you need a custom background, icon layout or pressed treatment.

## Continue

Read [Async](async.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Button#members) for types and documented defaults.
