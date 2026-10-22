# Line

Draw a straight line. Use it for chart axes, connectors and ticks.

## Draw a vector line

```tsx
import { Drawing, Line } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Line x1={10} y1={80} x2={90} y2={20} stroke="#2563eb" strokeWidth={4} />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Line#members) for types and documented defaults.
