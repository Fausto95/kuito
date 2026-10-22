# ContextMenu

`ContextMenu` is the menu a long press opens on the views it wraps: `UIContextMenuInteraction` on iOS, which lifts the views above the menu, and Android's floating context menu, which opens at the touch.

Use it for:

- actions on one item of a list or a grid: share, rename, delete;
- actions a tap shouldn't trigger;
- a secondary set of actions on a card that opens on a tap.

```tsx
import { ContextMenu, Text, VStack } from 'kuito';

const ITEMS = [
  { value: 'share', label: 'Share' },
  { value: 'played', label: 'Mark played' },
  { value: 'delete', label: 'Delete', destructive: true },
];

export default function Episode() {
  return (
    <ContextMenu title="Episode 4" items={ITEMS} onSelect={(event) => console.log(event.value)}>
      <VStack padding={12}>
        <Text>Episode 4</Text>
      </VStack>
    </ContextMenu>
  );
}
```

It lays its children out as a Box does, and is as large as they are unless its style sizes it.

## Patterns

### Keep a tap and add a menu

The long press is the platform's own and reaches the menu through the children: a Pressable inside keeps its tap, and a long press on it opens the menu instead of a press.

```tsx
import { ContextMenu, Pressable, Text } from 'kuito';

export default function Album(props: { open: () => void; remove: () => void }) {
  return (
    <ContextMenu
      items={[{ value: 'remove', label: 'Remove from library', destructive: true }]}
      onSelect={(event) => {
        if (event.value === 'remove') props.remove();
      }}
    >
      <Pressable onPress={props.open} padding={16}>
        <Text>Low Tide</Text>
      </Pressable>
    </ContextMenu>
  );
}
```

### Disable an item

A `disabled` item is dimmed and can't be chosen; a disabled menu opens nothing.

```tsx
import { ContextMenu, Text } from 'kuito';

export default function Download(props: { offline: boolean }) {
  return (
    <ContextMenu
      items={[
        { value: 'download', label: 'Download', disabled: props.offline },
        { value: 'share', label: 'Share' },
      ]}
      onSelect={(event) => console.log(event.value)}
    >
      <Text padding={16}>Night Drive</Text>
    </ContextMenu>
  );
}
```

## Platform differences

|               | iOS                                   | Android                      |
| ------------- | ------------------------------------- | ---------------------------- |
| Opens         | Lifts the views, the menu beside them | A floating menu at the touch |
| `destructive` | Red                                   | The theme's error color      |

Not yet: icons on items, submenus, and a custom preview.

## Accessibility

On Android, TalkBack offers the menu as the view's long-press action. Make sure what the menu does is also reachable another way, such as a details screen: a long press is easy to miss.

## Related

- [Pressable](./pressable.md)
- [actionSheet](../../../../docs/action-sheet.md), for a menu opened from code
- [ContextMenu in depth](../../../../docs/context-menu.md)
