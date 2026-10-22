# Settings

Choices that outlive the app: each control is bound to a persisted signal, and the defaults come from the user's region.

**Use it for**

- A toggle, a time, a segmented control and a select that are still set after a relaunch.
- Defaults from the user's measurement system and the weekday their calendar starts on.
- Showing the system's color scheme, which the app does not override.

The whole screen is [demo/recipes/settings.tsx](../../../../../demo/recipes/settings.tsx).

## Bind a control to persisted storage

`persisted` takes a default and a key. The schema rejects a value the type does not accept, and the signal stays at its default. An app would bring Zod or Valibot; this one is the Standard Schema written out.

```tsx
import { Select, Text, Toggle, VStack, persisted, type Schema } from 'kuito';

function schema<T>(valid: (value: unknown) => value is T): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'recipe',
      validate: (value) => (valid(value) ? { value } : { issues: [{ message: 'unexpected' }] }),
    },
  };
}

const isBoolean = schema((value): value is boolean => typeof value === 'boolean');
const isString = schema((value): value is string => typeof value === 'string');

const WEEKDAYS = [
  { value: '1', label: 'Sunday' },
  { value: '2', label: 'Monday' },
];

export default function Settings() {
  const reminders = persisted(false, { key: 'settings.reminders', schema: isBoolean });
  const weekStart = persisted('2', { key: 'settings.weekStart', schema: isString });

  return (
    <VStack padding={24} gap={20}>
      <Toggle label="Daily reminder" checked={reminders} />
      <Text>Week starts on</Text>
      <Select label="Week starts on" options={WEEKDAYS} value={weekStart} height={44} />
    </VStack>
  );
}
```

The screen also binds a `DatePicker` of `type="time"` to a persisted number of milliseconds, a `SegmentedControl` for metric or imperial, and reads `appearance.colorScheme` and `localization.locales` for the defaults. A time is formatted with `Intl.DateTimeFormat` from the user's language and whether their calendar uses a 24-hour clock.

## Related

- [Storage](../../../../../docs/storage.md#persisted): what `persisted` writes
- [Storage](../../../../../docs/storage.md#schemas): the schema a value must pass
- [Localization and RTL](../localization-rtl.md#read-the-users-language-and-region): locales and calendars
