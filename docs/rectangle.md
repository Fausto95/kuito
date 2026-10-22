# Rectangle

Draw a rectangle or rounded rectangle. Use it for chart bars and diagram blocks.

## Draw a vector rectangle

```tsx
import { Drawing, Rectangle } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Rectangle x={10} y={20} width={80} height={60} rx={8} fill="#2563eb" />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Rectangle#members) for types and documented defaults.
