# SegmentedControl

A row of exclusive choices, each a segment: UISegmentedControl on iOS, and
Material's segmented button on Android, a single-selection toggle group of
outlined buttons. It suits a few short choices the user switches between
often (a view's mode, a filter); a longer list belongs in a
[Select](select.md).

```tsx
import { SegmentedControl, signal, Text, VStack } from 'kuito';

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function Plan() {
  const view = signal('week');

  return (
    <VStack gap={8}>
      <SegmentedControl label="View" options={VIEWS} value={view} height={32} />
      <Text>{view.value}</Text>
    </VStack>
  );
}
```

A `SegmentedControl` is a [native view](native-modules.md#views): it takes
style, layout and accessibility props, and like any module's view it has no
size of its own. Give it a `height` (and a `width`, or let it stretch): the
segments share its width equally on both platforms. Its module is linked
only into apps that import it.

## Props

| Prop       | Default | Notes                                                             |
| ---------- | ------- | ----------------------------------------------------------------- |
| `options`  | none    | `{ value, label }[]` (a Select's `SelectOption`s), a segment each |
| `value`    | none    | The chosen segment's value; a signal is written as the user picks |
| `disabled` | `false` | Shows the choice and takes no touch                               |
| `onChange` | none    | `(value) => …`: the value of the segment the user picked          |

A `value` that names no option selects no segment, which is no error. Once
one is chosen, tapping it again keeps it: the user switches between
segments but cannot clear them, on both platforms. New `options` keep the
chosen value selected wherever its segment moves. Options that repeat a
value, lack a `value` or `label`, or are not a list fail as the prop's
`unsupportedValue` error. `onChange` reports the user's picks only: the
app's own `value` sends none.

## Tests

On the [headless host](testing.md), `choose(view, label)` picks the segment
that shows `label`, as for a [Select](select.md#tests), and reports its
value; a disabled control does nothing. Find it by its role and label: a
segmented control is a `radiogroup`, ARIA's role for one exclusive choice
among several.

```tsx
import { SegmentedControl, Text, VStack, signal } from 'kuito';
import { assert, choose, render, screen, test } from 'kuito/tests';

const VIEWS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function Plan() {
  const view = signal('week');

  return (
    <VStack>
      <SegmentedControl label="View" options={VIEWS} value={view} height={32} />
      <Text>{`View: ${view.value}`}</Text>
    </VStack>
  );
}

test('choosing Month sets its value', async () => {
  await render(<Plan />);

  await choose(screen.getByRole('radiogroup', { name: 'View' }), 'Month');

  assert.ok(screen.getByText('View: month'));
});
```
