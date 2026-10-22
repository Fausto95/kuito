# actionSheet

A list of actions, as a promise, on both platforms:
`UIAlertController`'s action sheet on iOS, a Material bottom sheet on
Android.

```tsx
import { Pressable, Text, actionSheet } from 'kuito';

declare function deleteEpisode(id: string): Promise<void>;

export function EpisodeMenu(props: { id: string; title: string }) {
  const remove = { text: 'Delete', style: 'destructive' } as const;

  return (
    <Pressable
      onPress={async (event) => {
        const picked = await actionSheet({
          buttons: [
            { text: 'Share' },
            { text: 'Add to list' },
            remove,
            { text: 'Cancel', style: 'cancel' },
          ],
          title: props.title,
          anchor: { x: event.pageX ?? 0, y: event.pageY ?? 0 },
        });

        if (picked === remove) await deleteEpisode(props.id);
      }}
    >
      <Text>More</Text>
    </Pressable>
  );
}
```

`actionSheet(options)` takes the same buttons as [`alert()`](alert.md) and
resolves with the button picked, the same object `buttons` holds. Dismissing
the sheet, by a tap outside, Back or a swipe, resolves the `cancel` button, or
`null` without one.

| Option             | Does                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `buttons`          | At least one `{ text, style, disabled }`, in order.                  |
| `title`, `message` | Above the buttons.                                                   |
| `tintColor`        | The buttons' color: a hex color. iOS 26's design ignores it.         |
| `anchor`           | `{ x, y }` in window points, as a press event's `pageX` and `pageY`. |
| `colorScheme`      | iOS: `light` or `dark` regardless of the app's appearance.           |

A button's `style` is `default`, `cancel` or `destructive`. The `cancel`
button is shown apart: at the bottom on iPhone and Android, hidden in an iPad
popover. At most one button is `cancel`. A `destructive` button is drawn in
red, and a `disabled` one is dimmed and can't be picked. No buttons, or two
`cancel` buttons, reject with a `TypeError` before anything shows.

## iPad and the anchor

iPad shows the sheet as a popover. With an `anchor` it points there; without
one it sits in the middle of the window with no arrow. Since iOS 26 an anchor
makes a popover on iPhone too; without one, iPhone keeps the sheet at the
bottom. A popover closes on a tap outside, which resolves the cancel button,
or `null` when there is none. The anchor is a location, not a view: it needs
no view lookup and points where the user touched.

Android lists the buttons in order, with the cancel button last below a
divider, and resolves `null` when the sheet is dismissed without one. A
reload closes the sheets still open.
