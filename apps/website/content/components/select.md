# Select

`Select` picks one option of a list, as HTML's `<select>`: on iOS a button that lists the options in its menu, on Android a Material outlined button that opens a popup menu. Given a signal as `value`, it writes the value of the option the user picks.

Use it for:

- a size, a country, a category among a handful to a few dozen;
- a sort order;
- a choice whose label is translated while its value stays the same.

```tsx
import { Select, Text, VStack, signal } from 'kuito';

const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
];

export default function Size() {
  const size = signal<string | undefined>(undefined);

  return (
    <VStack gap={8} padding={16}>
      <Select label="Size" options={SIZES} value={size} placeholder="Choose a size" height={44} />
      <Text>{size.value ?? 'No size yet'}</Text>
    </VStack>
  );
}
```

A Select is a [native view](../../../../docs/native-modules.md#views) with no size of its own: give it a `height`.

## Patterns

### React to a pick

`onChange` reports the user's picks only: the app's own `value` sends none.

```tsx
import { Select } from 'kuito';

const ORDERS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
];

export default function SortBy(props: { sort: (order: string) => void }) {
  return (
    <Select label="Sort by" options={ORDERS} value="recent" onChange={props.sort} height={44} />
  );
}
```

### Show translated labels

The app keeps an option's `value` and the user reads its `label`, so translating the labels leaves the app's state alone.

```tsx
import { Select, signal } from 'kuito';

export default function Units(props: { t: (key: string) => string }) {
  const unit = signal('km');

  return (
    <Select
      label={props.t('units')}
      options={[
        { value: 'km', label: props.t('kilometers') },
        { value: 'mi', label: props.t('miles') },
      ]}
      value={unit}
      height={44}
    />
  );
}
```

## Platform differences

|           | iOS                                       | Android                                         |
| --------- | ----------------------------------------- | ----------------------------------------------- |
| On screen | `UIButton`, gray, with an up-down chevron | Material outlined button with a drop-down arrow |
| Picking   | Its menu, on a tap                        | `PopupMenu` anchored to it                      |

## Accessibility

A screen reader reads it as a button that opens a menu on iOS, and as a drop-down list on Android. Tests find it as a `combobox`, HTML's role for a select. Give it a `label`.

## Related

- [SegmentedControl](./segmented-control.md), for two to five short choices
- [DatePicker](./date-picker.md)
- [Select in depth](../../../../docs/select.md)
