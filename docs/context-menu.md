# ContextMenu

The menu a long press opens on the views it wraps: UIContextMenuInteraction
on iOS, which lifts the views above the menu, and Android's floating context
menu, which opens at the touch. It suits actions on one thing in a list or a
grid (share, rename, delete) that a tap shouldn't trigger.

```tsx
import { ContextMenu, Text, VStack } from 'kuito';

type Episode = { id: string; title: string };

declare function act(episode: Episode, action: string): void;

const ITEMS = [
  { value: 'share', label: 'Share' },
  { value: 'played', label: 'Mark played' },
  { value: 'delete', label: 'Delete', destructive: true },
];

export function EpisodeRow(props: { episode: Episode }) {
  return (
    <ContextMenu
      title={props.episode.title}
      items={ITEMS}
      onSelect={(event) => act(props.episode, event.value)}
    >
      <VStack padding={12}>
        <Text>{props.episode.title}</Text>
      </VStack>
    </ContextMenu>
  );
}
```

A `ContextMenu` is a [native view](native-modules.md#views) that takes
children: it lays them out inside it as a `Box` does, and is as large as
they are unless its style sizes it. It takes style, layout and accessibility
props. Its module is linked only into apps that import it.

## Props

| Prop       | Default | Notes                                                                 |
| ---------- | ------- | --------------------------------------------------------------------- |
| `items`    | none    | `{ value, label, destructive, disabled }[]`, in the menu's order      |
| `title`    | none    | Heads the menu                                                        |
| `disabled` | `false` | Opens no menu; the children still take their touches                  |
| `onSelect` | none    | `(event) => …`: `event.value` is the value of the item the user chose |

A `destructive` item is drawn in red (the theme's error color on Android),
and a `disabled` one is dimmed and can't be chosen. With no items, or while
`disabled`, a long press opens nothing. Items that repeat a value, lack a
`value` or `label`, or are not a list fail as the prop's `unsupportedValue`
error.

The long press is the platform's own, and it reaches the menu through the
children's touches too: a `Pressable` inside keeps its tap, and a long press
on it opens the menu and cancels the press. On Android, TalkBack offers the
menu as the view's long-press action.

Not yet: icons on items, submenus, and a custom preview (iOS lifts the view
itself).

## Tests

On the [headless host](testing.md), `choose(view, label)` picks the item
that shows `label` in the menu the view is in, as a long press and a tap
would, and reports it to `onSelect`. A disabled item throws, as a user can't
pick it; a disabled menu does nothing.

```tsx
import { ContextMenu, Text, VStack, signal } from 'kuito';
import { assert, choose, render, screen, test } from 'kuito/tests';

function Episode() {
  const last = signal('none');

  return (
    <VStack>
      <ContextMenu
        items={[{ value: 'delete', label: 'Delete', destructive: true }]}
        onSelect={(event) => (last.value = event.value)}
      >
        <Text>Episode 4</Text>
      </ContextMenu>
      <Text>{`Last: ${last.value}`}</Text>
    </VStack>
  );
}

test('Delete reaches onSelect', async () => {
  await render(<Episode />);

  await choose(screen.getByText('Episode 4'), 'Delete');

  assert.ok(screen.getByText('Last: delete'));
});
```
