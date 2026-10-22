# Path

Draw a custom outline from SVG-style path commands. Use it for icons and irregular shapes.

## Draw a vector path

```tsx
import { Drawing, Path } from 'kuito';

export function Example() {
  return (
    <Drawing viewBox={[0, 0, 100, 100]} width={120} height={120} label="Vector example">
      <Path d="M10 50 L35 75 L90 15" fill="none" stroke="#2563eb" strokeWidth={8} />
    </Drawing>
  );
}
```

## Behavior

Place this shape inside Drawing. Coordinates use its viewBox, not screen points. Fill and stroke control paint. Shapes are drawing instructions rather than independently accessible native views.

## Continue

Read [Drawing](drawing.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Path#members) for types and documented defaults.
