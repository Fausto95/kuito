# Drawing

Render vector shapes in one drawing surface. Use it for diagrams, custom icons and small charts.

## Draw a completion badge

```tsx
import { Circle, Drawing, Path } from 'kuito';

export default function Done() {
  return (
    <Drawing label="Done" viewBox={[0, 0, 100, 100]} width={48} height={48}>
      <Circle cx={50} cy={50} r={45} fill="#34c759" />
      <Path
        d="M30 52l14 14 26-30"
        fill="none"
        stroke="#ffffff"
        strokeWidth={8}
        strokeLinecap="round"
      />
    </Drawing>
  );
}
```

## Behavior

`viewBox` defines the coordinate space independently of the displayed dimensions. Shape children use drawing coordinates. Put an accessible label on the drawing; individual shapes are not native interactive views.

## Continue

Read [Styles](styles.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Drawing#members) for types and documented defaults.
