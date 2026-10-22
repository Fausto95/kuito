# Circle

Draw a circle. Use it for dots, badges and circular chart markers.

## Draw a vector circle

```tsx
import { Drawing, Circle } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Circle cx={50} cy={50} r={35} fill="#2563eb" />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Circle#members) for types and documented defaults.
