# Choose an action with actionSheet

Offer a short list of actions in a system action sheet. Use it for choosing what to do with an item; use ContextMenu when the actions should be attached to a long-press target.

## Offer actions for an item

```tsx
import { Pressable, Text, actionSheet } from 'kuito';

export function EpisodeMenu(props: {
  id: string;
  title: string;
  onDelete: (id: string) => Promise<void>;
}) {
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

        if (picked === remove) await props.onDelete(props.id);
      }}
    >
      <Text>More</Text>
    </Pressable>
  );
}
```

## Behavior and limits

The promise resolves with the selected button object, the cancel button on dismissal, or null when no cancel button exists. Mark cancel and destructive actions explicitly. Presentation follows the platform; an iPad action sheet needs its anchor information where the API supports it. Keep labels specific verbs so users know what each choice does.

## Continue

Read [Alert](alert.md) for the related workflow. The API reference lists every method, option, event and return type.
