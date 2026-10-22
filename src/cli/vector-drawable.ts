/**
 * SVG → Android VectorDrawable, at build time: Android draws vectors only in
 * its own XML format, which covers the SVG icons are made of — paths, basic
 * shapes, groups with transforms, solid fills and strokes. Anything else
 * (text, gradients, clip paths, masks, filters, embedded images, `<use>`) is
 * an error naming the element, rather than a drawing that silently differs
 * from iOS's. Pure: SVG text in, XML text out.
 */
import { svgSize } from '../dev/image-size.ts';
import {
  color,
  declared,
  format,
  IGNORED,
  inherit,
  INITIAL,
  number,
  parse,
  SHAPES,
  type Element,
  type Paint,
} from '../dev/svg.ts';

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

function pathXml(data: string, paint: Paint, indent: string) {
  const fill = color(paint.fill);
  const stroke = color(paint.stroke);
  const values: Record<string, string> = { pathData: data.trim().replace(/\s+/g, ' ') };

  if (fill) {
    values.fillColor = fill.hex;

    const alpha = fill.alpha * number(paint['fill-opacity'], 'fill-opacity') * paint.opacity;

    if (alpha !== 1) values.fillAlpha = format(alpha);
    if (paint['fill-rule'] === 'evenodd') values.fillType = 'evenOdd';
  }

  if (stroke) {
    values.strokeColor = stroke.hex;
    values.strokeWidth = format(number(paint['stroke-width'], 'stroke-width'));

    const alpha = stroke.alpha * number(paint['stroke-opacity'], 'stroke-opacity') * paint.opacity;

    if (alpha !== 1) values.strokeAlpha = format(alpha);
    if (paint['stroke-linecap'] !== 'butt') values.strokeLineCap = paint['stroke-linecap'];
    if (paint['stroke-linejoin'] !== 'miter') values.strokeLineJoin = paint['stroke-linejoin'];
    if (paint['stroke-miterlimit'] !== '4') values.strokeMiterLimit = paint['stroke-miterlimit'];
  }

  return fill || stroke ? `${indent}<path${attributes(values)} />\n` : '';
}

/** Wraps `inner` in a group per transform function. */
function grouped(groups: Record<string, string>[], inner: string, indent: string): string {
  if (!groups.length) return inner;

  const [outer, ...rest] = groups;

  return `${indent}<group${attributes(outer)}>\n${grouped(rest, inner, indent + '  ')}${indent}</group>\n`;
}

function convert(element: Element, paint: Paint, indent: string): string {
  if (IGNORED.has(element.name) || declared(element).display === 'none') return '';

  for (const key of UNSUPPORTED_ATTRIBUTES)
    if (element.attributes[key] !== undefined) throw new Error(`<${element.name} ${key}>`);

  const own = inherit(paint, element);
  const groups = transformGroups(element.attributes.transform);
  const inner = indent + '  '.repeat(groups.length);

  if (element.name === 'g' || element.name === 'svg') {
    const children = element.children.map((child) => convert(child, own, inner)).join('');

    return grouped(groups, children, indent);
  }

  const shape = SHAPES[element.name];

  if (!shape) throw new Error(`<${element.name}>`);

  const read = (name: string, fallback?: string) => {
    const value = element.attributes[name] ?? fallback;

    if (value === undefined) throw new Error(`<${element.name}> without ${name}`);

    return number(value, name);
  };

  return grouped(groups, pathXml(shape(read, element), own, inner), indent);
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
    const body = grouped(origin, convert(root, INITIAL, '  '.repeat(origin.length + 1)), '  ');

    return (
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<vector xmlns:android="http://schemas.android.com/apk/res/android"' +
      ` android:width="${format(width)}dp" android:height="${format(height)}dp"` +
      ` android:viewportWidth="${format(viewportWidth)}" android:viewportHeight="${format(viewportHeight)}">\n` +
      body +
      '</vector>\n'
    );
  } catch (error) {
    const what = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Android cannot draw ${what}` +
        (what.includes('(gradients and patterns)') ? ': Android vectors draw solid colors' : '') +
        ': ' +
        'simplify the SVG, or bundle a PNG or PDF instead (docs/assets.md)',
      { cause: error },
    );
  }
}
