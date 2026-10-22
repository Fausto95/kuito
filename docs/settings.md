# Keep settings after a restart

Bind controls to `persisted` signals when a preference should survive relaunch. Give each preference a stable key and validate stored data with a Standard Schema implementation.

## Persist a toggle and a selection

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

The default is used when no valid saved value exists. Writes to the bound signals persist the preference. The schema is deliberately small here; applications can use a Standard Schema library and constrain the selected value to the available options.

For regional defaults, initialize from `localization.locales` or `localization.calendars`. Persist the user's explicit choice so a later system change does not unexpectedly replace it. See [storage](storage.md) and [localization](localization.md).
