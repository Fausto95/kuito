# DatePicker

`DatePicker` picks a date, a time, or both: on iOS the compact `UIDatePicker`, which opens a calendar or the time wheels; on Android a Material outlined button that opens the platform's date dialog, then its time dialog. Given a signal as `value`, it writes the moment the user picks.

Use it for:

- a due date or a reminder;
- a birthday;
- a time of day, such as a daily alarm.

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

The value is a moment in milliseconds since 1970 (`date.getTime()`), shown in the device's time zone and calendar. A DatePicker is a [native view](../../../../docs/native-modules.md#views) with no size of its own: give it a `height`.

## Patterns

### Pick a time of day

`type="time"` shows only the time; a pick keeps the moment's day.

```tsx
import { DatePicker, signal } from 'kuito';

export default function Alarm() {
  const at = signal(new Date(2026, 0, 1, 7, 30).getTime());

  return <DatePicker label="Alarm" type="time" value={at} height={44} />;
}
```

### Store a birthday as a day

A day with no time of day is best kept as the date the user picked, read in the device's zone, rather than the number.

```tsx
import { DatePicker } from 'kuito';

export default function Birthday(props: {
  save: (day: { year: number; month: number; day: number }) => void;
}) {
  return (
    <DatePicker
      label="Birthday"
      max={Date.now()}
      height={44}
      onChange={(value) => {
        const date = new Date(value);

        props.save({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
      }}
    />
  );
}
```

## Platform differences

|              | iOS                                      | Android                                                    |
| ------------ | ---------------------------------------- | ---------------------------------------------------------- |
| On screen    | `UIDatePicker`, compact: a pill per part | Material outlined button showing the moment                |
| Picking      | A popover calendar, or the time wheels   | `DatePickerDialog`, then `TimePickerDialog` for `datetime` |
| `min`, `max` | Bound the calendar and the wheels        | Bound the calendar                                         |

A pick stays within `min` and `max` on both: one that the hidden part puts past a bound is moved to the bound.

## Accessibility

Each platform's screen reader reads its own control: on iOS each part (the date, the time) is its own element. Tests find it by the `button` role. Give it a `label`, what the moment is for.

## Related

- [Select](./select.md)
- [Localization](../../../../docs/localization.md), for formatting the moment
- [DatePicker in depth](../../../../docs/date-picker.md)
