# SegmentedControl

`SegmentedControl` is a row of exclusive choices, each a segment: `UISegmentedControl` on iOS, Material's segmented button on Android. Given a signal as `value`, it writes the value of the segment the user picks.

Use it for:

- a view's mode: day, week, month;
- a filter the user switches often;
- a few short choices that all fit on one line.

```tsx
import { SegmentedControl, Text, VStack, signal } from 'kuito';

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export default function Plan() {
  const view = signal('week');

  return (
    <VStack gap={8} padding={16}>
      <SegmentedControl label="View" options={VIEWS} value={view} height={32} />
      <Text>{view.value}</Text>
    </VStack>
  );
}
```

A SegmentedControl is a [native view](../../../../docs/native-modules.md#views) with no size of its own: give it a `height`. The segments share its width equally. A longer list of choices belongs in a [Select](./select.md).

## Patterns

### Switch what the screen shows

```tsx
import { Match, SegmentedControl, Switch, Text, VStack, signal } from 'kuito';

const TABS = [
  { value: 'songs', label: 'Songs' },
  { value: 'albums', label: 'Albums' },
];

export default function Library() {
  const tab = signal('songs');

  return (
    <VStack gap={12} padding={16}>
      <SegmentedControl label="Library" options={TABS} value={tab} height={32} />
      <Switch>
        <Match when={tab.value === 'songs'}>
          <Text>All songs</Text>
        </Match>
        <Match when={tab.value === 'albums'}>
          <Text>All albums</Text>
        </Match>
      </Switch>
    </VStack>
  );
}
```

### Disable it while loading

```tsx
import { SegmentedControl, signal } from 'kuito';

export default function Range(props: { loading: boolean }) {
  const range = signal('7d');

  return (
    <SegmentedControl
      label="Range"
      options={[
        { value: '7d', label: '7 days' },
        { value: '30d', label: '30 days' },
      ]}
      value={range}
      disabled={props.loading}
      height={32}
    />
  );
}
```

## Platform differences

None in behavior: once a segment is chosen, tapping it again keeps it on both platforms, so the user switches between segments but cannot clear them.

## Accessibility

Each platform's screen reader reads the segments and which one is selected. Tests find it as a `radiogroup`, ARIA's role for one exclusive choice among several. Give it a `label`.

## Related

- [Select](./select.md)
- [Switch](./switch.md)
- [SegmentedControl in depth](../../../../docs/segmented-control.md)
