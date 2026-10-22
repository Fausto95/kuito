# Polygon

Connect points and close the outline. Use it for arrows, badges and filled regions.

## Draw a vector polygon

```tsx
import { Drawing, Polygon } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Polygon
        points={[
          [50, 10],
          [90, 85],
          [10, 85],
        ]}
        fill="#2563eb"
      />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Polygon#members) for types and documented defaults.
