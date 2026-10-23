/**
 * SVG → Android VectorDrawable, at build time: Android draws vectors only in
 * its own XML format, which covers the SVG icons are made of — paths, basic
 * shapes, groups with transforms, fills and strokes in solid colors or linear
 * and radial gradients. Anything else (text, patterns, clip paths, masks,
 * filters, embedded images, `<use>`) is an error naming the element, rather
 * than a drawing that silently differs from iOS's. Pure: SVG text in, XML text
 * out.
 */
import { svgSize } from '../dev/image-size.ts';
import { pathBounds, type Bounds } from '../dev/path-bounds.ts';
import {
  color,
  declared,
  format,
  gradients as gradientsOf,
  IDENTITY,
  IGNORED,
  inherit,
  INITIAL,
  multiply,
  number,
  parse,
  SHAPES,
  type Element,
  type Gradient,
  type GradientStop,
  type Paint,
} from '../dev/svg.ts';

type Gradients = ReadonlyMap<string, Gradient>;

const TILE_MODES: Readonly<Record<Gradient['spread'], string>> = {
  pad: 'clamp',
  reflect: 'mirror',
  repeat: 'repeat',
};

/** `#aarrggbb`, as a gradient's items take their colors. */
const argb = (hex: string, alpha: number) =>
  '#' +
  Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0') +
  hex.slice(1);

/**
 * The gradient as VectorDrawable draws it, in the path's own coordinates, or
 * the one color it amounts to: SVG paints one stop as that color, and a
 * gradient of no length or radius as its last stop.
 */
function gradientPaint(
  gradient: Gradient,
  bounds: Bounds,
  opacity: number,
): { color: GradientStop } | { attributes: Record<string, string>; stops: GradientStop[] } {
  const stops = gradient.stops.map((stop) => ({ ...stop, alpha: stop.alpha * opacity }));
  const last = stops.at(-1);

  if (!last) return { color: { offset: 0, hex: '#000000', alpha: 0 } };
  if (stops.length === 1) return { color: last };

  const [minX, minY, maxX, maxY] = bounds;
  const box: typeof IDENTITY =
    gradient.units === 'objectBoundingBox'
      ? [maxX - minX, 0, 0, maxY - minY, minX, minY]
      : IDENTITY;
  // Gradient space to the path's: its transform first, then the box's.
  const [a, b, c, d, e, f] = multiply(box, gradient.transform);
  const apply = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
  const tileMode = TILE_MODES[gradient.spread];

  if (gradient.kind === 'linear') {
    const [dx, dy] = [gradient.x2 - gradient.x1, gradient.y2 - gradient.y1];
    const length = dx * dx + dy * dy;
    const determinant = a * d - b * c;

    if (!length || !determinant) return { color: last };

    // Where the gradient is 0 maps exactly; its direction maps as a normal
    // does, through the inverse transpose, so the lines along which it stays
    // the same color land where SVG draws them, the box's skew included.
    const [startX, startY] = apply(gradient.x1, gradient.y1);
    const gx = (d * dx - b * dy) / determinant / length;
    const gy = (-c * dx + a * dy) / determinant / length;
    const steepness = gx * gx + gy * gy;

    return {
      attributes: {
        type: 'linear',
        startX: format(startX),
        startY: format(startY),
        endX: format(startX + gx / steepness),
        endY: format(startY + gy / steepness),
        tileMode,
      },
      stops,
    };
  }

  if (gradient.fx !== gradient.cx || gradient.fy !== gradient.cy)
    throw new Error('a radial gradient with its own focal point (fx, fy)');

  // Android's radial gradients are circles: a transform must keep one round.
  const scale = Math.hypot(a, b);

  if (
    Math.abs(Math.hypot(c, d) - scale) > 1e-6 * scale ||
    Math.abs(a * c + b * d) > 1e-6 * scale * scale
  )
    throw new Error(
      'an elliptical radial gradient (a box that is not square, or a gradientTransform that stretches it)',
    );

  if (!gradient.r || !scale) return { color: last };

  const [centerX, centerY] = apply(gradient.cx, gradient.cy);

  return {
    attributes: {
      type: 'radial',
      centerX: format(centerX),
      centerY: format(centerY),
      gradientRadius: format(gradient.r * scale),
      tileMode,
    },
    stops,
  };
}

function gradientXml(
  attribute: string,
  paint: { attributes: Record<string, string>; stops: GradientStop[] },
  indent: string,
) {
  const items = paint.stops.map(
    (stop) =>
      `${indent}      <item android:offset="${format(stop.offset)}" android:color="${argb(stop.hex, stop.alpha)}" />\n`,
  );

  return (
    `${indent}  <aapt:attr name="android:${attribute}">\n` +
    `${indent}    <gradient${attributes(paint.attributes)}>\n` +
    items.join('') +
    `${indent}    </gradient>\n` +
    `${indent}  </aapt:attr>\n`
  );
}

/** One SVG transform function as nested VectorDrawable groups' attributes, outermost first. */
function transformGroups(transform: string | undefined): Record<string, string>[] {
  if (!transform) return [];

  const groups: Record<string, string>[] = [];

  for (const [, name, args] of transform.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const [a = 0, b, c, d, e, f] = args
      .trim()
      .split(/[\s,]+/)
      .map((value) => number(value, name));

    switch (name) {
      case 'translate':
        groups.push({ translateX: format(a), translateY: format(b ?? 0) });
        break;
      case 'scale':
        groups.push({ scaleX: format(a), scaleY: format(b ?? a) });
        break;
      case 'rotate':
        groups.push({ rotation: format(a), pivotX: format(b ?? 0), pivotY: format(c ?? 0) });
        break;
      case 'matrix': {
        // translate · rotate · scale, which is every matrix without a skew.
        const [m, n, o, p] = [a, b ?? 0, c ?? 0, d ?? 1];
        const scaleX = Math.hypot(m, n);
        const scaleY = (m * p - n * o) / scaleX;

        if (Math.abs(m * o + n * p) > 1e-6) throw new Error(`a skewing transform="${transform}"`);

        groups.push(
          { translateX: format(e ?? 0), translateY: format(f ?? 0) },
          { rotation: format((Math.atan2(n, m) * 180) / Math.PI) },
          { scaleX: format(scaleX), scaleY: format(scaleY) },
        );

        break;
      }
      default:
        throw new Error(`a ${name}() transform`);
    }
  }

  return groups;
}

const UNSUPPORTED_ATTRIBUTES = ['clip-path', 'mask', 'filter'];

function attributes(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => ` android:${key}="${value}"`)
    .join('');
}

/**
 * A paint's color or gradient. `url(#id)` names a gradient of the file; one
 * that names nothing, or a pattern, cannot be drawn.
 */
function paintOf(
  value: string,
  opacity: number,
  data: string,
  gradients: Gradients,
): { color: GradientStop } | { attributes: Record<string, string>; stops: GradientStop[] } | null {
  const reference = /^url\(\s*#([^)\s]+)\s*\)$/.exec(value.trim());

  if (!reference) {
    const solid = color(value);

    return solid && { color: { offset: 0, ...solid, alpha: solid.alpha * opacity } };
  }

  const gradient = gradients.get(reference[1]);

  if (!gradient) throw new Error(`a ${value.trim()} paint that names no gradient`);

  const bounds = pathBounds(data);

  return bounds && gradientPaint(gradient, bounds, opacity);
}

function pathXml(data: string, paint: Paint, indent: string, gradients: Gradients) {
  const pathData = data.trim().replace(/\s+/g, ' ');
  const fill = paintOf(
    paint.fill,
    number(paint['fill-opacity'], 'fill-opacity') * paint.opacity,
    pathData,
    gradients,
  );
  const stroke = paintOf(
    paint.stroke,
    number(paint['stroke-opacity'], 'stroke-opacity') * paint.opacity,
    pathData,
    gradients,
  );
  const values: Record<string, string> = { pathData };
  let children = '';

  if (fill) {
    if ('color' in fill) {
      values.fillColor = fill.color.hex;
      if (fill.color.alpha !== 1) values.fillAlpha = format(fill.color.alpha);
    } else children += gradientXml('fillColor', fill, indent);

    if (paint['fill-rule'] === 'evenodd') values.fillType = 'evenOdd';
  }

  if (stroke) {
    if ('color' in stroke) {
      values.strokeColor = stroke.color.hex;
      values.strokeWidth = format(number(paint['stroke-width'], 'stroke-width'));
      if (stroke.color.alpha !== 1) values.strokeAlpha = format(stroke.color.alpha);
    } else {
      values.strokeWidth = format(number(paint['stroke-width'], 'stroke-width'));
      children += gradientXml('strokeColor', stroke, indent);
    }

    if (paint['stroke-linecap'] !== 'butt') values.strokeLineCap = paint['stroke-linecap'];
    if (paint['stroke-linejoin'] !== 'miter') values.strokeLineJoin = paint['stroke-linejoin'];
    if (paint['stroke-miterlimit'] !== '4') values.strokeMiterLimit = paint['stroke-miterlimit'];
  }

  if (!fill && !stroke) return '';

  return children
    ? `${indent}<path${attributes(values)}>\n${children}${indent}</path>\n`
    : `${indent}<path${attributes(values)} />\n`;
}

/** Wraps `inner` in a group per transform function. */
function grouped(groups: Record<string, string>[], inner: string, indent: string): string {
  if (!groups.length) return inner;

  const [outer, ...rest] = groups;

  return `${indent}<group${attributes(outer)}>\n${grouped(rest, inner, indent + '  ')}${indent}</group>\n`;
}

function convert(element: Element, paint: Paint, indent: string, gradients: Gradients): string {
  if (IGNORED.has(element.name) || declared(element).display === 'none') return '';

  for (const key of UNSUPPORTED_ATTRIBUTES)
    if (element.attributes[key] !== undefined) throw new Error(`<${element.name} ${key}>`);

  const own = inherit(paint, element);
  const groups = transformGroups(element.attributes.transform);
  const inner = indent + '  '.repeat(groups.length);

  if (element.name === 'g' || element.name === 'svg') {
    const children = element.children
      .map((child) => convert(child, own, inner, gradients))
      .join('');

    return grouped(groups, children, indent);
  }

  const shape = SHAPES[element.name];

  if (!shape) throw new Error(`<${element.name}>`);

  const read = (name: string, fallback?: string) => {
    const value = element.attributes[name] ?? fallback;

    if (value === undefined) throw new Error(`<${element.name}> without ${name}`);

    return number(value, name);
  };

  return grouped(groups, pathXml(shape(read, element), own, inner, gradients), indent);
}

/** The VectorDrawable XML of an SVG file's text. */
export function vectorDrawable(text: string): string {
  try {
    const svg = parse(text);
    const { width, height } = svgSize(text);
    const box = (svg.attributes.viewBox ?? `0 0 ${width} ${height}`)
      .trim()
      .split(/[\s,]+/)
      .map((value) => number(value, 'viewBox'));
    const [minX = 0, minY = 0, viewportWidth = width, viewportHeight = height] = box;
    const origin = minX || minY ? [{ translateX: format(-minX), translateY: format(-minY) }] : [];
    // The root's own transform is not part of its drawing.
    const root = { ...svg, attributes: { ...svg.attributes, transform: '' } };
    const painted = gradientsOf(svg, [viewportWidth, viewportHeight]);
    const body = grouped(
      origin,
      convert(root, INITIAL, '  '.repeat(origin.length + 1), painted),
      '  ',
    );
    // Gradients are colors given as inline resources, in aapt's namespace.
    const aapt = body.includes('<aapt:attr') ? ' xmlns:aapt="http://schemas.android.com/aapt"' : '';

    return (
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      `<vector xmlns:android="http://schemas.android.com/apk/res/android"${aapt}` +
      ` android:width="${format(width)}dp" android:height="${format(height)}dp"` +
      ` android:viewportWidth="${format(viewportWidth)}" android:viewportHeight="${format(viewportHeight)}">\n` +
      body +
      '</vector>\n'
    );
  } catch (error) {
    const what = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Android cannot draw ${what}` +
        ': ' +
        'simplify the SVG, or bundle a PNG or PDF instead (docs/assets.md)',
      { cause: error },
    );
  }
}
