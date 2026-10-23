/**
 * An SVG file as the shapes a Drawing draws (`import icon from
 * './icon.svg?drawing'`, docs/drawing.md), read when the app compiles by the
 * reader Android's VectorDrawable conversion uses (src/dev/svg.ts). Each
 * shape arrives resolved as src/native/drawing-shapes.ts resolves a JSX
 * shape: its paint inherited, its opacities folded into its colors, its
 * transforms one matrix. Anything a Drawing cannot draw is an error naming
 * the element. Pure: SVG text in, plain data out.
 */
import { svgSize } from './image-size.ts';
import {
  color,
  declared,
  IDENTITY,
  IGNORED,
  inherit,
  INITIAL,
  multiply,
  number,
  oneOf,
  parse,
  SHAPES,
  transformOf,
} from './svg.ts';
import type { Element, Matrix, Paint } from './svg.ts';

/** A shape as the Drawing's native view takes it: src/native/drawing-shapes.ts's DrawnShape. */
export interface SvgShape {
  d: string;
  fill: string | null;
  fillRule: 'nonzero' | 'evenodd';
  stroke: string | null;
  strokeWidth: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  strokeLinejoin: 'miter' | 'round' | 'bevel';
  strokeMiterlimit: number;
  strokeDasharray: number[];
  strokeDashoffset: number;
  opacity: number;
  transform: Matrix;
}

export interface SvgDrawing {
  viewBox: [number, number, number, number];
  shapes: SvgShape[];
}

/** `#rrggbbaa` of a color with its opacity, or null for none. */
function paintColor(value: string, opacity: number): string | null {
  const parsed = color(value);

  if (!parsed) return null;

  const alpha = Math.round(Math.min(Math.max(parsed.alpha * opacity, 0), 1) * 255);

  return parsed.hex + alpha.toString(16).padStart(2, '0');
}

/** As src/native/drawing-shapes.ts: an odd list repeats, and one summing to 0 is solid. */
function dashes(value: string): number[] {
  if (value.trim() === 'none') return [];

  const lengths = value
    .trim()
    .split(/[\s,]+/)
    .map((length) => number(length, 'stroke-dasharray'));

  if (lengths.some((length) => length < 0)) throw new Error(`stroke-dasharray="${value}"`);

  if (lengths.every((length) => length === 0)) return [];

  return lengths.length % 2 ? [...lengths, ...lengths] : lengths;
}

function shapeOf(d: string, paint: Paint, transform: Matrix): SvgShape {
  const strokeWidth = number(paint['stroke-width'], 'stroke-width');

  return {
    d,
    fill: paintColor(paint.fill, number(paint['fill-opacity'], 'fill-opacity')),
    fillRule: oneOf('fill-rule', paint['fill-rule'], ['nonzero', 'evenodd']),
    // A stroke of no width is none, as SVG draws it.
    stroke:
      strokeWidth === 0
        ? null
        : paintColor(paint.stroke, number(paint['stroke-opacity'], 'stroke-opacity')),
    strokeWidth,
    strokeLinecap: oneOf('stroke-linecap', paint['stroke-linecap'], ['butt', 'round', 'square']),
    strokeLinejoin: oneOf('stroke-linejoin', paint['stroke-linejoin'], ['miter', 'round', 'bevel']),
    strokeMiterlimit: number(paint['stroke-miterlimit'], 'stroke-miterlimit'),
    strokeDasharray: dashes(paint['stroke-dasharray']),
    strokeDashoffset: number(paint['stroke-dashoffset'], 'stroke-dashoffset'),
    opacity: paint.opacity,
    transform,
  };
}

const UNSUPPORTED_ATTRIBUTES = ['clip-path', 'mask', 'filter'];

/** The sizes that disable a shape in SVG when 0. */
const SIZES: Readonly<Record<string, readonly string[]>> = {
  rect: ['width', 'height'],
  circle: ['r'],
  ellipse: ['rx', 'ry'],
};

function walk(element: Element, paint: Paint, outer: Matrix, into: SvgShape[]): void {
  if (IGNORED.has(element.name) || declared(element).display === 'none') return;

  for (const key of UNSUPPORTED_ATTRIBUTES)
    if (element.attributes[key] !== undefined) throw new Error(`<${element.name} ${key}>`);

  const own = inherit(paint, element);
  const transform = multiply(outer, transformOf(element.attributes.transform));

  if (element.name === 'g' || element.name === 'svg')
    return element.children.forEach((child) => walk(child, own, transform, into));

  const shape = SHAPES[element.name];

  if (!shape) throw new Error(`<${element.name}>`);

  const read = (name: string, fallback?: string) => {
    const value = element.attributes[name] ?? fallback;

    if (value === undefined) throw new Error(`<${element.name}> without ${name}`);

    return number(value, name);
  };

  if ((SIZES[element.name] ?? []).some((name) => read(name, '0') === 0)) return;

  const d = shape(read, element).trim();

  if (d) into.push(shapeOf(d, own, transform));
}

export function svgDrawing(text: string): SvgDrawing {
  try {
    const svg = parse(text);
    const { width, height } = svgSize(text);
    const box = (svg.attributes.viewBox ?? `0 0 ${width} ${height}`)
      .trim()
      .split(/[\s,]+/)
      .map((value) => number(value, 'viewBox'));
    const shapes: SvgShape[] = [];

    if (box.length !== 4 || box[2] <= 0 || box[3] <= 0)
      throw new Error(`viewBox="${svg.attributes.viewBox}"`);

    // The root's own transform is not part of its drawing.
    walk({ ...svg, attributes: { ...svg.attributes, transform: '' } }, INITIAL, IDENTITY, shapes);

    return { viewBox: box as SvgDrawing['viewBox'], shapes };
  } catch (error) {
    throw new Error(
      `a Drawing cannot draw ${error instanceof Error ? error.message : String(error)}: ` +
        'simplify the SVG, or bundle it as an image (docs/drawing.md)',
      { cause: error },
    );
  }
}
