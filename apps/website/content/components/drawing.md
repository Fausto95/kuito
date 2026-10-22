# Drawing

`Drawing` draws shapes as vectors, as SVG's `<svg>`: an icon tinted by state, a progress ring, a chart. Its children are shapes (`Path`, `Rectangle`, `Circle`, `Ellipse`, `Line`, `Polyline`, `Polygon` and `Group`), each redrawn when a signal it reads changes.

Use it for:

- a progress ring or a gauge;
- an icon whose color follows state;
- a sparkline or a small chart.

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

A Drawing is a [native view](../../../../docs/native-modules.md#views) with no size of its own: give it a `width` and a `height`. `viewBox` is the user space `[x, y, width, height]`, scaled whole into the view and centered; without one a user unit is a point.

## Patterns

### Draw a progress ring

A dash as long as the progress, on a circle rotated to start at the top. `Circle` starts at its rightmost point and runs clockwise, as in a browser.

```tsx
import { Circle, Drawing, signal } from 'kuito';

export default function Ring() {
  const done = signal(0.6);
  const length = 2 * Math.PI * 40;

  return (
    <Drawing label="Progress" viewBox={[0, 0, 100, 100]} width={64} height={64}>
      <Circle cx={50} cy={50} r={40} fill="none" stroke="#e5e5ea" strokeWidth={10} />
      <Circle
        cx={50}
        cy={50}
        r={40}
        fill="none"
        stroke="#34c759"
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={[length * done.value, length]}
        rotate={-90}
        translateY={100}
      />
    </Drawing>
  );
}
```

### Plot a sparkline

```tsx
import { Drawing, Line, Polyline } from 'kuito';

const plays = [3, 8, 5, 12, 9, 15, 11];

export default function Sparkline() {
  const points = plays.map((count, day) => [day * 10, 20 - count] as const);

  return (
    <Drawing label="Plays this week" viewBox={[0, 0, 60, 20]} width={120} height={40}>
      <Line x1={0} y1={20} x2={60} y2={20} stroke="#e5e7eb" />
      <Polyline
        points={points}
        fill="none"
        stroke="#e5484d"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Drawing>
  );
}
```

### Share paint and a transform with a Group

A `Group`'s paint is its shapes' unless they give their own, as SVG inherits it; transforms compose from the outermost Group in.

```tsx
import { Drawing, Ellipse, Group, Polygon, Rectangle } from 'kuito';

export default function Badge() {
  return (
    <Drawing label="Badge" viewBox={[0, 0, 40, 40]} width={40} height={40}>
      <Group fill="#5b5bd6" opacity={0.9}>
        <Rectangle x={4} y={4} width={32} height={32} rx={8} />
        <Ellipse cx={20} cy={20} rx={10} ry={6} fill="#ffffff" />
      </Group>
      <Group translateX={20} translateY={20} rotate={45}>
        <Polygon
          points={[
            [0, -4],
            [4, 0],
            [0, 4],
            [-4, 0],
          ]}
          fill="#f5b301"
        />
      </Group>
    </Drawing>
  );
}
```

### Draw an SVG file

An SVG imported with `?drawing` is read into shapes when the app compiles, and drawn from `src`.

```tsx
import { Drawing } from 'kuito';
import check from './icons/check.svg?drawing';

export default function Check() {
  return <Drawing label="Done" src={check} width={24} height={24} />;
}
```

## Platform differences

None in what it draws: one parser reads the path data for both. iOS draws with CAShapeLayers, Android on a Canvas. Not yet: gradients, clip paths, masks and text.

## Accessibility

Tests find a Drawing as an image (`getByRole('img')`). On a device it is a plain view: give it `accessible`, `role="img"` and a `label` for a screen reader to read it.

## Related

- [Symbol](./symbol.md), for the platform's icons
- [Image](./image.md), for bitmaps and bundled SVGs
- [Drawing in depth](../../../../docs/drawing.md)
