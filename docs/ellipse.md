# Ellipse

Draw an ellipse. Use it for oval markers and illustrations.

## Draw a vector ellipse

```tsx
import { Drawing, Ellipse } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Ellipse cx={50} cy={50} rx={40} ry={25} fill="#2563eb" />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Ellipse#members) for types and documented defaults.
