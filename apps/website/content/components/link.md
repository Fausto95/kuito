# Link

`Link` is a [Pressable](./pressable.md) that navigates to `to`, a destination from `routes`. It takes a Pressable's props, except `onPress`.

Use it for:

- a row of a list that opens its details;
- a text or a card that leads to another screen;
- replacing the current screen, as a step of a flow.

```tsx
import { Link, Text, routes, type RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    settings: RouteTo;
  }
}

export default function ShowRow() {
  return (
    <Link to={routes.show({ id: 42 })} padding={16} pressedOpacity={0.6}>
      <Text>The Tide, season 2</Text>
    </Link>
  );
}
```

A Link navigates as `navigate(to)` does: a route in another tab selects that tab, a stack's first route pops the stack to it, a sheet, modal or full-screen route is presented, and any other route is pushed. A route already on top with the same params stays as it is.

## Patterns

### Replace the current screen

`replace` swaps the top screen instead of pushing, so back skips it. It applies to a pushed route: a stack's first route pops the stack to it either way.

```tsx
import { Link, Text, routes } from 'kuito';

export default function Done() {
  return (
    <Link to={routes.settings()} replace padding={16}>
      <Text>Continue to settings</Text>
    </Link>
  );
}
```

### Navigate from code instead

Where the navigation follows something other than a press, call `navigate` with the same destination.

```tsx
import { Button, navigate, routes } from 'kuito';

export default function Save(props: { save: () => Promise<void> }) {
  return (
    <Button
      onPress={async () => {
        await props.save();
        navigate(routes.settings());
      }}
    >
      Save
    </Button>
  );
}
```

## Accessibility

A Link is one element, read as its children's text unless it has a `label`, like any Pressable. Add `role="link"` when it reads as a link in running text.

## Related

- [Navigation](../guides/navigation.md)
- [Router](./router.md)
- [Pressable](./pressable.md)
