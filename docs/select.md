# Select

Picks one option of a list, as HTML's `<select>`: on iOS a UIKit button
that shows the chosen option and lists the options in its menu, the chosen
one checked; on Android a Material outlined button that opens a popup
menu of the options in the same way.

```tsx
import { Select, signal, Text, VStack } from 'kuito';

const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
];

function Size() {
  const size = signal<string | undefined>(undefined);

  return (
    <VStack gap={8}>
      <Select label="Size" options={SIZES} value={size} placeholder="Choose a size" height={44} />
      <Text>{size.value ?? 'No size yet'}</Text>
    </VStack>
  );
}
```

A `Select` is a [native view](native-modules.md#views): it takes style,
layout and accessibility props, and like any module's view it has no size of
its own. Give it a `height` (and a `width`, or let it stretch). Its module is
linked only into apps that import it.

## Props

| Prop          | Default | Notes                                                            |
| ------------- | ------- | ---------------------------------------------------------------- |
| `options`     | none    | `{ value, label }[]`, in menu order; no two with the same value  |
| `value`       | none    | The chosen option's value; a signal is written as the user picks |
| `placeholder` | none    | Shown, dimmed, while `value` names no option                     |
| `disabled`    | `false` | Shows the choice and takes no touch                              |
| `onChange`    | none    | `(value) => …`: the value of the option the user picked          |

The app keeps an option's `value` and the user reads its `label`, so a
translated label leaves the app's state alone. A `value` that names no
option is no error: nothing is chosen, and the placeholder shows. Options
that repeat a value, lack a `value` or `label`, or are not a list fail as the
prop's `unsupportedValue` error. `onChange` reports the user's picks only:
the app's own `value` sends none.

## Platforms

|               | iOS                                            | Android                                             |
| ------------- | ---------------------------------------------- | --------------------------------------------------- |
| On screen     | `UIButton`, gray, with an up-down chevron      | Material outlined button with a drop-down arrow     |
| Picking       | Its menu on a tap (`showsMenuAsPrimaryAction`) | `PopupMenu` anchored to it, single-choice checkable |
| Accessibility | A button that opens a menu                     | A drop-down list, as TalkBack announces a `Spinner` |

## Tests

On the [headless host](testing.md), `choose(view, label)` picks the option
that shows `label`, as a user finds it, and reports its value. A label no
option shows, or that several show, throws, naming the ones it has, and a
disabled select does nothing. Find it by its role and label: a select is a `combobox`, HTML's
role for it.

```tsx
import { Select, Text, VStack, signal } from 'kuito';
import { assert, choose, render, screen, test } from 'kuito/tests';

const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'l', label: 'Large' },
];

function Size() {
  const size = signal<string | undefined>(undefined);

  return (
    <VStack>
      <Select label="Size" options={SIZES} value={size} height={44} />
      <Text>{`Size: ${size.value ?? 'none'}`}</Text>
    </VStack>
  );
}

test('choosing Large sets its value', async () => {
  await render(<Size />);

  await choose(screen.getByRole('combobox', { name: 'Size' }), 'Large');

  assert.ok(screen.getByText('Size: l'));
});
```
