# DatePicker

Choose a date, time or both with a native picker. Use it for deadlines, appointments and reminders.

## Choose a future due date

```tsx
import { DatePicker, Text, VStack, signal } from 'kuito';

export default function Due() {
  const due = signal(Date.now());

  return (
    <VStack gap={8} padding={16}>
      <DatePicker label="Due" type="datetime" value={due} min={Date.now()} height={44} />
      <Text>{new Date(due.value).toLocaleString()}</Text>
    </VStack>
  );
}
```

## Behavior

`value`, `min` and `max` are milliseconds since the epoch. `type` selects the picker mode. Display the result with locale-aware date formatting. The native picker presentation differs between platforms.

## Continue

Read [Localization](localization.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/DatePicker#members) for types and documented defaults.
