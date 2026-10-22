# Button

`Button` is the platform's own button, titled by its children: a system `UIButton` on iOS, an `android.widget.Button` on Android.

Use it for:

- the main action of a screen or a form;
- a retry or a confirm in a message;
- an action that should look like the platform's.

```tsx
import { Button, signal } from 'kuito';

export default function Retry() {
  const loading = signal(false);

  return (
    <Button disabled={loading.value} onPress={() => (loading.value = true)}>
      Try again
    </Button>
  );
}
```

`onPress` fires on a completed tap, and `disabled` ignores taps. For a pressable area of your own design, use [Pressable](./pressable.md).

## Patterns

### Disable it while a request runs

A `task` holds the request's state as signals, so the button follows it.

```tsx
import { Button, task } from 'kuito';

export default function Save(props: { save: () => Promise<void> }) {
  const saving = task(() => props.save());

  return (
    <Button disabled={saving.running.value} onPress={() => void saving.run()}>
      {saving.running.value ? 'Saving…' : 'Save'}
    </Button>
  );
}
```

### Style its title

It takes Text's font props.

```tsx
import { Button } from 'kuito';

export default function Delete() {
  return (
    <Button color="#e5484d" fontWeight="bold" onPress={() => console.log('delete')}>
      Delete
    </Button>
  );
}
```

## Platform differences

Each platform draws its own button, so the look differs: on iOS a system `UIButton`, its title in the tint color with no background; on Android an `android.widget.Button` in the app theme's button style. For the same look on both, build one with a [Pressable](./pressable.md).

## Accessibility

A screen reader reads it as a button with its title. Its title follows the user's text size; unlike [Text](./text.md), it takes no cap on the growth.

## Related

- [Pressable](./pressable.md)
- [Text](./text.md)
- [Link](./link.md), a pressable that navigates
