# Drawing

Shapes drawn as vectors, as SVG's `<svg>`: an icon tinted by state, a
progress ring, a chart. Its children are shapes, each redrawn when a signal
it reads changes. CAShapeLayers on iOS, a Canvas on Android; the path data
is read by one parser both share (`native/shared/PathData.h`).

```tsx
import { Circle, Drawing, Path, signal } from 'kuito';

function Progress(props: { done: number }) {
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
        strokeDasharray={[length * props.done, length]}
        rotate={-90}
        translateY={100}
      />
      <Path d="M35 50l10 10 20-20" fill="none" stroke="#34c759" strokeWidth={6} />
    </Drawing>
  );
}
```

A `Drawing` is a [native view](native-modules.md#views): like any module's
view it has no size of its own, so give it a `width` and a `height`. A
screen reader calls it an image (`getByRole('img')` in tests); give it a
`label`. Its module is linked only into apps that import it.

## The drawing

| Prop      | Notes                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| `viewBox` | `[x, y, width, height]`: the user space, scaled whole into the view and centered |
| children  | Its shapes, in order: later ones over earlier ones                               |

Without a `viewBox` a user unit is a point. With one, the drawing keeps its
aspect: SVG's default `xMidYMid meet`.

## Shapes

| Shape       | Props                                         |
| ----------- | --------------------------------------------- |
| `Path`      | `d`: SVG path data                            |
| `Rectangle` | `x`, `y`, `width`, `height`, `rx`, `ry`       |
| `Circle`    | `cx`, `cy`, `r`                               |
| `Ellipse`   | `cx`, `cy`, `rx`, `ry`                        |
| `Line`      | `x1`, `y1`, `x2`, `y2`                        |
| `Polyline`  | `points`: `[x, y]` pairs                      |
| `Polygon`   | `points`, closed                              |
| `Group`     | children: shapes and Groups sharing its paint |

Each takes SVG's paint and Kuito's transform props:

| Prop                                                            | Default   |
| --------------------------------------------------------------- | --------- |
| `fill`: a hex color or `none`                                   | `#000`    |
| `fillRule`: `nonzero` or `evenodd`                              | `nonzero` |
| `stroke`: a hex color or `none`                                 | `none`    |
| `strokeWidth`, in user units                                    | `1`       |
| `strokeLinecap`: `butt`, `round` or `square`                    | `butt`    |
| `strokeLinejoin`: `miter`, `round` or `bevel`                   | `miter`   |
| `strokeMiterlimit`                                              | `4`       |
| `strokeDasharray`: dash and gap lengths; `strokeDashoffset`     | none      |
| `opacity`, from 0 to 1, multiplied through its Groups           | `1`       |
| `translateX`, `translateY`, then `rotate` (degrees) and `scale` | none      |

A Group's paint is its shapes' unless they give their own, as SVG inherits
it. As in SVG, a shape of no size (a Rectangle of no width, a Circle of no
radius, empty points or data) draws nothing, a stroke of no width is none,
an odd dash list repeats to make an even one, and dashes that sum to 0 draw
a solid line. Circles and ellipses start at their rightmost point and run
clockwise, so dashes fall where a browser puts them. Transforms compose from the outermost Group in, about the user space's
origin, and a stroke scales with its shape. Colors are hex (`#rgb`,
`#rgba`, `#rrggbb`, `#rrggbbaa`); a named color, a negative length, a
shape outside a Drawing or anything that isn't a shape inside one is an
error naming the shape.

## Path data

`d` is SVG 2's path grammar: every command, absolute and relative, implicit
linetos after a moveto, compact numbers (`M.5.5`, `1e2-3`) and arc flags,
reflected control points for `S` and `T`, and arcs with SVG's radius rules.
Malformed data is an error, not a partial path as a browser draws: the
prop's `unsupportedValue`, with the parser's message saying what is wrong
and where:

```
KUITO_PATH: path data starts with a moveto, not L, at 0 in "L1 2"
```

## SVG files

An SVG file imported with `?drawing` is read into shapes when the app
compiles, and a Drawing draws it from `src`, in the file's viewBox unless it
gives its own, under its children:

```tsx
import { Drawing } from 'kuito';
import check from './icons/check.svg?drawing';

export const Done = () => <Drawing label="Done" src={check} width={24} height={24} />;
```

The file is read by the reader that converts SVGs to Android vectors
([assets](assets.md#bundled-images)): paths, basic shapes, groups, presentation
attributes and `style` declarations, named, hex and `rgb()` colors, with
`fill-opacity` and `stroke-opacity` folded into the colors. Any transform
works, skews included: a Drawing takes a matrix. Text, gradients and
patterns, clip paths, masks, filters, embedded images and `<use>` are a
compile error naming the file and the element. The import bundles no image
into the shells; a bare `.svg` import is still a bundled image for an
`Image`. Editing the file recompiles the app, as editing a source file does.

## Redrawing

A shape's props may read signals. When one changes, the Drawing makes its
shapes again and the native view redraws them all; nothing else on the
screen re-plans. Shapes don't follow UI-thread motion values yet: a ring
that animates every frame does so from a signal on the JavaScript thread.

Not yet: gradients, clip paths, masks, text, and SVG markup read at run time.
