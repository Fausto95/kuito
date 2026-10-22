# DatePicker

Picks a date, a time, or both: UIDatePicker's compact style on iOS, a button
that shows the moment and opens the calendar or the clock, and on Android a
Material outlined button that opens the platform's date dialog, then its time
dialog for `datetime`.

```tsx
import { DatePicker, signal, Text, VStack } from 'kuito';

function Due() {
  const due = signal(Date.now());

  return (
    <VStack gap={8}>
      <DatePicker label="Due" type="datetime" value={due} min={Date.now()} height={44} />
      <Text>{new Date(due.value).toLocaleString()}</Text>
    </VStack>
  );
}
```

A `DatePicker` is a [native view](native-modules.md#views): it takes style,
layout and accessibility props, and like any module's view it has no size of
its own. Give it a `height` (and a `width`, or let it stretch). Its module is
linked only into apps that import it.

## Props

| Prop       | Default | Notes                                                                      |
| ---------- | ------- | -------------------------------------------------------------------------- |
| `value`    | now     | Milliseconds since 1970, `date.getTime()`; a signal is written as it picks |
| `type`     | `date`  | `date`, `time`, or `datetime` (HTML's `datetime-local`)                    |
| `min`      | none    | The earliest moment the user can pick, in milliseconds                     |
| `max`      | none    | The latest moment the user can pick, in milliseconds                       |
| `disabled` | `false` | Shows the moment and takes no touch                                        |
| `onChange` | none    | `(value) => …`: the moment the user picked, in milliseconds                |

The value is a moment, as HTML's `valueAsNumber` and `Date` hold one: the
picker shows it in the device's time zone and calendar, and the user's pick
comes back as the same kind of number. A pick changes only what the type
shows: picking a day keeps the moment's time, and picking a time keeps its
day. For a day with no time of day (a birthday), store the date the user
picked as you read it, in the device's zone (`getFullYear()`,
`getMonth()`, `getDate()`), rather than the number.

A pick stays within `min` and `max` on both platforms: what the type hides
can put a picked day past a bound (a day picked at `min`'s date, keeping an
earlier time), and the pick is then moved to the bound. A `max` before the
`min` wins.

A value that isn't a number of milliseconds, or a type other than these
three, fails as the prop's `unsupportedValue` error, like any invalid prop.
`onChange` reports the user's picks only: the app's own `value` sends none.

## Platforms

|                | iOS                                       | Android                                                    |
| -------------- | ----------------------------------------- | ---------------------------------------------------------- |
| On screen      | UIDatePicker, `.compact`: a pill per part | Material outlined button showing the formatted moment      |
| Picking        | A popover calendar, or the time wheels    | `DatePickerDialog`, then `TimePickerDialog` for `datetime` |
| `min`, `max`   | Bound the calendar and the wheels         | Bound the calendar                                         |
| 12 or 24 hours | The device's setting                      | The device's setting                                       |

## Tests

On the [headless host](testing.md), `choose(view, date)` picks a moment as a
user does: what the type shows comes from `date` and the rest from the
picker's value, in the host's time zone as a device uses its own, kept within
`min` and `max`. A day outside them throws, and a disabled picker does
nothing. Find the picker by its role and
label: both platforms announce it as a button.

```tsx
import { DatePicker, Text, VStack, signal } from 'kuito';
import { assert, choose, render, screen, test } from 'kuito/tests';

function Due() {
  const due = signal(new Date(2026, 9, 21, 14, 30).getTime());

  return (
    <VStack>
      <DatePicker label="Due" value={due} height={44} />
      <Text>{`Due: ${new Date(due.value).getDate()}`}</Text>
    </VStack>
  );
}

test('a day keeps the time', async () => {
  await render(<Due />);

  await choose(screen.getByRole('button', { name: 'Due' }), new Date(2026, 11, 24));

  assert.ok(screen.getByText('Due: 24'));
});
```
