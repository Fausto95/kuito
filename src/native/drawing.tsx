import DrawingModule from '../../native/modules/drawing/drawing';
import type { KuitoNode } from '../ui/jsx';
import { computed } from '../ui/reactivity';
import type { NativeViewProps } from './views';
import { drawnShapes, type DrawnShape } from './drawing-shapes';

export {
  Circle,
  Ellipse,
  Group,
  Line,
  Path,
  Polygon,
  Polyline,
  Rectangle,
  type CircleProps,
  type EllipseProps,
  type FillRule,
  type GroupProps,
  type LineProps,
  type PathProps,
  type PolygonProps,
  type PolylineProps,
  type RectangleProps,
  type ShapePaint,
  type StrokeLinecap,
  type StrokeLinejoin,
} from './drawing-shapes';

/** What the native view draws: the user space and the shapes, as data. */
export type DrawingViewProps = {
  viewBox?: [number, number, number, number];
  shapes: DrawnShape[];
};

/** An SVG file read into shapes when the app compiles: `import icon from './icon.svg?drawing'`. */
export type DrawingSource = {
  readonly viewBox: readonly [number, number, number, number];
  readonly shapes: readonly DrawnShape[];
};

/** Props of `Drawing`: its user space, an imported SVG, and its shapes as children. */
export type DrawingProps = Omit<NativeViewProps<DrawingViewProps>, 'shapes' | 'viewBox'> & {
  /** An imported SVG's shapes, drawn under its children, in its viewBox unless one is given. */
  src?: DrawingSource;
  /**
   * The user space `[x, y, width, height]` the shapes are drawn in, scaled
   * to fit the view and centered, keeping its aspect. Without one a user
   * unit is a point.
   */
  viewBox?: readonly [number, number, number, number];
  /** Its shapes: Path, Rectangle, Circle, Ellipse, Line, Polyline, Polygon and Group. */
  children?: KuitoNode;
};

const DrawingView = DrawingModule.view;

/**
 * Shapes drawn as vectors, as SVG's `<svg>`: its children are shapes, each
 * redrawn when a signal it reads changes. A screen reader calls it an
 * image; give it a `label`. Give it a size: a module's view is sized by its
 * style (docs/drawing.md).
 */
export function Drawing(props: DrawingProps): KuitoNode {
  const { src, viewBox, children, ...rest } = props;
  // Read again when a signal a shape reads changes; nothing else re-draws.
  const shapes = computed(() => [...(src?.shapes ?? []), ...drawnShapes(children)]);
  const space = viewBox ?? src?.viewBox;

  return (
    <DrawingView {...rest} viewBox={space === undefined ? undefined : [...space]} shapes={shapes} />
  );
}
