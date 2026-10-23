# Symbol

Show a platform symbol without bundling a raster icon. Use it for common actions and status indicators.

## Label a favorite icon

```tsx
import { Symbol } from 'kuito';

export default function Rating() {
  return <Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" label="Favorite" />;
}
```

## Behavior

Set an accessible label when the icon conveys information. Names and available artwork depend on the platform symbol system; use an image or drawing for a custom brand mark.

## Props

<!-- Symbol props: generated from src/protocol/manifest.ts -->

| Prop                  | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `name` _(Kuito)_      | An SF Symbol on iOS and a Material Symbol on Android, or `{ ios, android }`. |
| `size` _(Kuito)_      | In points; 24 by default, and the view’s size.                               |
| `weight` _(Kuito)_    | `ultralight` to `black`; `regular` by default.                               |
| `tintColor` _(Kuito)_ | The symbol’s color; black by default.                                        |

<!-- end of generated props -->

## Continue

Read [Accessibility](accessibility.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Symbol#members) for types and documented defaults.
