# Polyline

Connect a series of points without closing the shape. Use it for line charts and open outlines.

## Draw a vector polyline

```tsx
import { Drawing, Polyline } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Polyline
        points={[
          [10, 80],
          [35, 40],
          [60, 55],
          [90, 15],
        ]}
        fill="none"
        stroke="#2563eb"
        strokeWidth={4}
      />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Polyline#members) for types and documented defaults.
