# Group

Apply shared paint or transforms to several drawing shapes. Use it to move or style a diagram section together.

## Draw a vector group

```tsx
import { Drawing, Group, Circle } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Group fill="#2563eb">
        <Circle cx={30} cy={50} r={15} />
        <Circle cx={70} cy={50} r={15} />
      </Group>
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Group#members) for types and documented defaults.
