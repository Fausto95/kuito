// A Drawing's children as the shapes its native view draws (docs/drawing.md):
// each a path's `d` in user units, its paint resolved through its Groups as
// SVG inherits it, and the matrix its Groups and its own transform make.
// Pure: elements in, plain data out. The shape components only mark
// elements; a Drawing reads them, as a Router reads its Routes.
import type { KuitoNode } from '../ui/jsx';

export type FillRule = 'nonzero' | 'evenodd';
export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';

/** How a shape is painted, as SVG's presentation attributes. A Group's is its shapes'. */
export interface ShapePaint {
  /** A hex color, or `none`; black by default. */
  fill?: string;
  fillRule?: FillRule;
  /** A hex color, or `none`, the default. */
  stroke?: string;
  /** In user units; 1 by default. */
  strokeWidth?: number;
  strokeLinecap?: StrokeLinecap;
  strokeLinejoin?: StrokeLinejoin;
  strokeMiterlimit?: number;
  /** Dash and gap lengths in user units, repeated. */
  strokeDasharray?: readonly number[];
  strokeDashoffset?: number;
  /** Multiplies with its Groups' opacity. */
  opacity?: number;
  /** In user units, then `rotate` in degrees and `scale`, about the origin. */
  translateX?: number;
  translateY?: number;
  scale?: number;
  rotate?: number;
}

/** Props of `Path`: its path data and paint. */
export interface PathProps extends ShapePaint {
  /** SVG path data: `M0 0L10 10Z`. */
  d: string;
}

/** Props of `Rectangle`: its box in user units, corner radii and paint. */
export interface RectangleProps extends ShapePaint {
  x?: number;
  y?: number;
  width: number;
  height: number;
  /** Corner radii; each defaults to the other, as SVG's do. */
  rx?: number;
  ry?: number;
}

/** Props of `Circle`: its center and radius in user units, and paint. */
export interface CircleProps extends ShapePaint {
  cx?: number;
  cy?: number;
  r: number;
}

/** Props of `Ellipse`: its center and radii in user units, and paint. */
export interface EllipseProps extends ShapePaint {
  cx?: number;
  cy?: number;
  rx: number;
  ry: number;
}

/** Props of `Line`: its two ends in user units, and paint. */
export interface LineProps extends ShapePaint {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/** Props of `Polyline`: the `[x, y]` points it runs through, and paint. */
export interface PolylineProps extends ShapePaint {
  points: readonly (readonly [number, number])[];
}

/** Props of `Polygon`: the `[x, y]` points it closes, and paint. */
export interface PolygonProps extends PolylineProps {}

/** Props of `Group`: the paint and transform its shapes share, and the shapes. */
export interface GroupProps extends ShapePaint {
  children?: KuitoNode;
}

/** A shape as the native view draws it: every field given. */
export type DrawnShape = {
  d: string;
  /** `#rrggbbaa`, or null for none. */
  fill: string | null;
  fillRule: FillRule;
  stroke: string | null;
  strokeWidth: number;
  strokeLinecap: StrokeLinecap;
  strokeLinejoin: StrokeLinejoin;
  strokeMiterlimit: number;
  strokeDasharray: number[];
  strokeDashoffset: number;
  opacity: number;
  /** SVG's matrix `[a, b, c, d, e, f]`: x' = a x + c y + e, y' = b x + d y + f. */
  transform: [number, number, number, number, number, number];
};

function outside(name: string): never {
  throw new TypeError(`<${name}> draws only inside a <Drawing>`);
}

/** A shape drawn from SVG path data, `d`, inside a `Drawing`. */
export function Path(_props: PathProps): KuitoNode {
  return outside('Path');
}

/** A rectangle inside a `Drawing`, its corners rounded by `rx` and `ry`. */
export function Rectangle(_props: RectangleProps): KuitoNode {
  return outside('Rectangle');
}

/** A circle inside a `Drawing`, centered at `cx`, `cy`. */
export function Circle(_props: CircleProps): KuitoNode {
  return outside('Circle');
}

/** An ellipse inside a `Drawing`, centered at `cx`, `cy`, with radii `rx` and `ry`. */
export function Ellipse(_props: EllipseProps): KuitoNode {
  return outside('Ellipse');
}

/** A straight line inside a `Drawing`, from `x1`, `y1` to `x2`, `y2`; it shows with a `stroke`. */
export function Line(_props: LineProps): KuitoNode {
  return outside('Line');
}

/** An open run of straight lines through `points`, inside a `Drawing`. */
export function Polyline(_props: PolylineProps): KuitoNode {
  return outside('Polyline');
}

/** A closed shape through `points`, inside a `Drawing`. */
export function Polygon(_props: PolygonProps): KuitoNode {
  return outside('Polygon');
}

/** Shapes inside a `Drawing` that inherit the group's paint and transform, as SVG's `<g>`. */
export function Group(_props: GroupProps): KuitoNode {
  return outside('Group');
}

type Props = Record<string, unknown>;
type Matrix = DrawnShape['transform'];

/** A number as path data writes it: no exponent, no trailing zeros. */
function num(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;

  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** A value as an error shows it: a number as written, anything else as JSON. */
const shown = (value: unknown): string =>
  typeof value === 'number' ? String(value) : (JSON.stringify(value) ?? String(value));

function length(shape: string, props: Props, key: string, fallback?: number): number {
  const value = props[key] ?? fallback;

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new TypeError(`${shape} ${key} is a length from 0, not ${shown(value)}`);

  return value;
}

function coordinate(shape: string, props: Props, key: string): number {
  const value = props[key] ?? 0;

  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${shape} ${key} is a number, not ${shown(value)}`);

  return value;
}

function pointsOf(shape: string, props: Props): [number, number][] {
  const points = props.points;

  if (
    !Array.isArray(points) ||
    !points.every(
      (point: unknown) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)),
    )
  )
    throw new TypeError(`${shape} points are [x, y] pairs`);

  return points as [number, number][];
}

const polyline = (points: [number, number][]) =>
  points.length === 0
    ? null
    : points.map(([x, y], index) => (index ? 'L' : 'M') + num(x) + ' ' + num(y)).join('');

/**
 * Each shape's outline as path data, as SVG 2's basic shapes define it;
 * null for a shape of no size, which SVG does not render.
 */
const GEOMETRY: Readonly<Record<string, (props: Props) => string | null>> = {
  Path(props) {
    if (typeof props.d !== 'string') throw new TypeError('Path takes its data in d');

    return props.d.trim() === '' ? null : props.d;
  },
  Rectangle(props) {
    const x = coordinate('Rectangle', props, 'x');
    const y = coordinate('Rectangle', props, 'y');
    const width = length('Rectangle', props, 'width');
    const height = length('Rectangle', props, 'height');

    if (width === 0 || height === 0) return null;

    const given = (key: string) =>
      props[key] === undefined ? undefined : length('Rectangle', props, key);
    const rx = Math.min(given('rx') ?? given('ry') ?? 0, width / 2);
    const ry = Math.min(given('ry') ?? given('rx') ?? 0, height / 2);

    if (rx === 0 || ry === 0)
      return `M${num(x)} ${num(y)}H${num(x + width)}V${num(y + height)}H${num(x)}Z`;

    const arc = (toX: number, toY: number) =>
      `A${num(rx)} ${num(ry)} 0 0 1 ${num(toX)} ${num(toY)}`;

    return (
      `M${num(x + rx)} ${num(y)}H${num(x + width - rx)}` +
      arc(x + width, y + ry) +
      `V${num(y + height - ry)}` +
      arc(x + width - rx, y + height) +
      `H${num(x + rx)}` +
      arc(x, y + height - ry) +
      `V${num(y + ry)}` +
      arc(x + rx, y) +
      'Z'
    );
  },
  Circle: (props) => {
    const r = length('Circle', props, 'r');

    return ellipse(coordinate('Circle', props, 'cx'), coordinate('Circle', props, 'cy'), r, r);
  },
  Ellipse: (props) =>
    ellipse(
      coordinate('Ellipse', props, 'cx'),
      coordinate('Ellipse', props, 'cy'),
      length('Ellipse', props, 'rx'),
      length('Ellipse', props, 'ry'),
    ),
  Line: (props) =>
    `M${num(coordinate('Line', props, 'x1'))} ${num(coordinate('Line', props, 'y1'))}` +
    `L${num(coordinate('Line', props, 'x2'))} ${num(coordinate('Line', props, 'y2'))}`,
  Polyline: (props) => polyline(pointsOf('Polyline', props)),
  Polygon: (props) => {
    const outline = polyline(pointsOf('Polygon', props));

    return outline === null ? null : outline + 'Z';
  },
};

/** Clockwise from its rightmost point, as SVG 2 draws it, so dashes start where they do there. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string | null {
  if (rx === 0 || ry === 0) return null;

  const arc = (toX: number) => `A${num(rx)} ${num(ry)} 0 1 1 ${num(toX)} ${num(cy)}`;

  return `M${num(cx + rx)} ${num(cy)}` + arc(cx - rx) + arc(cx + rx) + 'Z';
}

const SHAPES = new Map<unknown, string>([
  [Path, 'Path'],
  [Rectangle, 'Rectangle'],
  [Circle, 'Circle'],
  [Ellipse, 'Ellipse'],
  [Line, 'Line'],
  [Polyline, 'Polyline'],
  [Polygon, 'Polygon'],
]);

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A color as the native view takes it: `#rrggbbaa`, or null for none. */
function color(shape: string, key: string, value: unknown): string | null {
  if (value === 'none') return null;

  if (typeof value !== 'string' || !HEX.test(value))
    throw new TypeError(
      `${shape} ${key} takes a hex color or "none", not ${JSON.stringify(value)}`,
    );

  const hex = value.slice(1).toLowerCase();
  const full = hex.length <= 4 ? hex.replace(/./g, (digit) => digit + digit) : hex;

  return '#' + (full.length === 6 ? full + 'ff' : full);
}

function oneOf<T extends string>(
  shape: string,
  key: string,
  value: unknown,
  values: readonly T[],
): T {
  if (!values.includes(value as T))
    throw new TypeError(`${shape} ${key} is ${values.join(', ')}, not ${JSON.stringify(value)}`);

  return value as T;
}

/** What a shape inherits: its Groups' paint, opacity and matrix. */
interface Inherited {
  paint: Props;
  opacity: number;
  transform: Matrix;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const PAINT = [
  'fill',
  'fillRule',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeMiterlimit',
  'strokeDasharray',
  'strokeDashoffset',
];

function multiply(p: Matrix, q: Matrix): Matrix {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

/** Translate, then rotate, then scale, as a view's transform props compose. */
function ownTransform(shape: string, props: Props): Matrix {
  const tx = coordinate(shape, props, 'translateX');
  const ty = coordinate(shape, props, 'translateY');
  const scale = props.scale === undefined ? 1 : coordinate(shape, props, 'scale');
  const radians = (coordinate(shape, props, 'rotate') * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [cos * scale, sin * scale, -sin * scale, cos * scale, tx, ty];
}

function inheritFrom(shape: string, props: Props, outer: Inherited): Inherited {
  const paint = { ...outer.paint };

  PAINT.forEach((key) => {
    if (props[key] !== undefined) paint[key] = props[key];
  });

  const opacity = props.opacity === undefined ? 1 : coordinate(shape, props, 'opacity');

  if (opacity < 0 || opacity > 1)
    throw new TypeError(`${shape} opacity is from 0 to 1, not ${opacity}`);

  return {
    paint,
    opacity: outer.opacity * opacity,
    transform: multiply(outer.transform, ownTransform(shape, props)),
  };
}

function drawn(shape: string, d: string, { paint, opacity, transform }: Inherited): DrawnShape {
  const dashes = paint.strokeDasharray ?? [];

  if (!Array.isArray(dashes)) throw new TypeError(`${shape} strokeDasharray takes lengths from 0`);

  dashes.forEach((dash: unknown) => {
    if (typeof dash !== 'number' || !Number.isFinite(dash) || dash < 0)
      throw new TypeError(`${shape} strokeDasharray takes lengths from 0, not ${shown(dash)}`);
  });

  const strokeWidth = length(shape, paint, 'strokeWidth', 1);
  const lengths = dashes as number[];

  return {
    d,
    fill: color(shape, 'fill', paint.fill ?? '#000'),
    fillRule: oneOf(shape, 'fillRule', paint.fillRule ?? 'nonzero', ['nonzero', 'evenodd']),
    // A stroke of no width is none; Android would draw a hairline.
    stroke: strokeWidth === 0 ? null : color(shape, 'stroke', paint.stroke ?? 'none'),
    strokeWidth,
    strokeLinecap: oneOf(shape, 'strokeLinecap', paint.strokeLinecap ?? 'butt', [
      'butt',
      'round',
      'square',
    ]),
    strokeLinejoin: oneOf(shape, 'strokeLinejoin', paint.strokeLinejoin ?? 'miter', [
      'miter',
      'round',
      'bevel',
    ]),
    strokeMiterlimit: length(shape, paint, 'strokeMiterlimit', 4),
    // SVG repeats an odd list to make an even one, and a list summing to 0
    // draws a solid line: both platforms take the list as it is.
    strokeDasharray: lengths.every((dash) => dash === 0)
      ? []
      : lengths.length % 2
        ? [...lengths, ...lengths]
        : lengths,
    strokeDashoffset: coordinate(shape, paint, 'strokeDashoffset'),
    opacity,
    transform,
  };
}

function isElement(value: unknown): value is { type: unknown; props: Props } {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

/** A child as written: a list, a signal, or an expression the compiler made a thunk. */
function resolved(child: unknown): unknown {
  if (typeof child === 'function') return resolved((child as () => unknown)());

  if (typeof child === 'object' && child !== null && !Array.isArray(child) && !isElement(child))
    return 'value' in child ? resolved(child.value) : child;

  return child;
}

/** A prop as written: a value, a signal, or a thunk the compiler made of an expression. */
function propsOf(props: Props): Props {
  const values: Props = {};

  Object.keys(props).forEach((key) => {
    if (key === 'children') return;

    const value = props[key];

    values[key] =
      typeof value === 'function'
        ? (value as () => unknown)()
        : typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value
          ? value.value
          : value;
  });

  return values;
}

function walk(child: unknown, inherited: Inherited, into: DrawnShape[]): void {
  const node = resolved(child);

  if (node === null || node === undefined || typeof node === 'boolean') return;

  if (Array.isArray(node)) return node.forEach((each) => walk(each, inherited, into));

  if (!isElement(node))
    throw new TypeError(
      `A Drawing draws shapes, not the text ${shown(typeof node === 'string' ? node : JSON.stringify(node))}`,
    );

  const props = propsOf(node.props);

  if (node.type === Group) {
    const inner = inheritFrom('Group', props, inherited);

    return walk(node.props.children, inner, into);
  }

  const name = SHAPES.get(node.type);

  if (!name) {
    const named = typeof node.type === 'function' ? node.type.name : String(node.type);

    throw new TypeError(
      `A Drawing draws Path, Rectangle, Circle, Ellipse, Line, Polyline, Polygon and Group, not ${named}`,
    );
  }

  const d = GEOMETRY[name](props);

  if (d !== null) into.push(drawn(name, d, inheritFrom(name, props, inherited)));
}

/** The shapes `children` draw, in order: later ones over earlier ones. */
export function drawnShapes(children: unknown): DrawnShape[] {
  const shapes: DrawnShape[] = [];

  walk(children, { paint: {}, opacity: 1, transform: IDENTITY }, shapes);

  return shapes;
}
