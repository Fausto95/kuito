# Link

Navigate from pressable content. Use it for a row or label whose action opens a screen.

## Open a detail route from a row

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

## Behavior

`to` takes a typed destination from `routes`. `replace` swaps the current route instead of pushing. For navigation after asynchronous work use `navigate`; for external URLs use `linking.open`.

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Link#members) for types and documented defaults.
