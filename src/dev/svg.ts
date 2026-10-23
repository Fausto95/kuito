/**
 * An SVG file's text read into elements and paint, at build time: what
 * Android's VectorDrawable conversion (src/cli/vector-drawable.ts) and a
 * Drawing's `?drawing` import (src/dev/svg-drawing.ts) both start from. It
 * covers what icons are made of: paths, basic shapes as path data, groups,
 * presentation attributes and `style` declarations, solid colors. Errors
 * name what it cannot read; each caller says who cannot draw it. Pure.
 */

export interface Element {
  name: string;
  attributes: Record<string, string>;
  children: Element[];
}

// Gradients are definitions: they draw only through the paint that names them.
export const IGNORED = new Set([
  'title',
  'desc',
  'metadata',
  'defs',
  'sodipodi:namedview',
  'linearGradient',
  'radialGradient',
]);

/** Elements and attributes; comments, declarations and text are dropped. */
export function parse(text: string): Element {
  const root: Element = { name: '#document', attributes: {}, children: [] };
  const open: Element[] = [root];
  const body = text.replace(
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g,
    '',
  );

  for (const [, closing, name, rest, selfClosing] of body.matchAll(
    /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g,
  )) {
    const parent = open.at(-1) ?? root;

    if (closing) {
      if (open.length > 1) open.pop();
      continue;
    }

    const attributes: Record<string, string> = {};

    for (const [, key, double, single] of rest.matchAll(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    ))
      attributes[key] = double ?? single;

    const element = { name, attributes, children: [] };

    parent.children.push(element);
    if (!selfClosing) open.push(element);
  }

  const svg = root.children.find((child) => child.name === 'svg');

  if (!svg) throw new Error('no <svg> element');

  return svg;
}

/** The paint and stroke an element inherits, plus its opacity so far. */
export interface Paint {
  fill: string;
  stroke: string;
  'stroke-width': string;
  'stroke-linecap': string;
  'stroke-linejoin': string;
  'stroke-miterlimit': string;
  'fill-rule': string;
  'fill-opacity': string;
  'stroke-opacity': string;
  'stroke-dasharray': string;
  'stroke-dashoffset': string;
  opacity: number;
}

const INHERITED = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
] as const;

export const INITIAL: Paint = {
  fill: '#000000',
  stroke: 'none',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'fill-rule': 'nonzero',
  'fill-opacity': '1',
  'stroke-opacity': '1',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',
  opacity: 1,
};

/** Presentation attributes, with `style` declarations over them. */
export function declared(element: Element): Record<string, string> {
  const styles = Object.fromEntries(
    (element.attributes.style ?? '')
      .split(';')
      .map((declaration) => declaration.split(':').map((part) => part.trim()))
      .filter(([key, value]) => key && value !== undefined),
  );

  return { ...element.attributes, ...styles };
}

export function inherit(paint: Paint, element: Element): Paint {
  const own = declared(element);
  const next = { ...paint };

  for (const key of INHERITED)
    if (own[key] !== undefined && own[key] !== 'inherit') next[key] = own[key];

  next.opacity = paint.opacity * number(own.opacity ?? '1', 'opacity');

  return next;
}

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '000000',
  white: 'ffffff',
  red: 'ff0000',
  green: '008000',
  blue: '0000ff',
  yellow: 'ffff00',
  gray: '808080',
  grey: '808080',
  orange: 'ffa500',
  purple: '800080',
  // A tinted icon's color is the tint; drawn opaque, it takes any.
  currentcolor: '000000',
};

/** `#rrggbb` and an alpha in 0–1, or null for `none`. */
export function color(value: string): { hex: string; alpha: number } | null {
  const text = value.trim().toLowerCase();

  if (text === 'none' || text === 'transparent') return null;

  if (text.startsWith('url(')) throw new Error(`a ${text} paint (gradients and patterns)`);

  const named = NAMED_COLORS[text];

  if (named) return { hex: '#' + named, alpha: 1 };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];

  if (hex) {
    const full = hex.length <= 4 ? hex.replace(/./g, (digit) => digit + digit) : hex;

    return {
      hex: '#' + full.slice(0, 6),
      alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1,
    };
  }

  const rgb = /^rgba?\(([^)]*)\)$/
    .exec(text)?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean);

  if (rgb && (rgb.length === 3 || rgb.length === 4)) {
    const channels = rgb
      .slice(0, 3)
      .map((channel) =>
        channel.endsWith('%') ? (parseFloat(channel) / 100) * 255 : parseFloat(channel),
      );

    return {
      hex: '#' + channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join(''),
      alpha: rgb[3] === undefined ? 1 : parseFloat(rgb[3]),
    };
  }

  throw new Error(`the color ${value}`);
}

export function number(value: string, what: string) {
  const parsed = Number(value.trim().replace(/px$/, ''));

  if (!Number.isFinite(parsed)) throw new Error(`${what}="${value}": only plain numbers convert`);

  return parsed;
}

export const format = (value: number) => String(Math.round(value * 10000) / 10000);

/** Each basic shape as path data. */
export const SHAPES: Readonly<
  Record<string, (n: (name: string, fallback?: string) => number, element: Element) => string>
> = {
  path: (_n, element) => element.attributes.d ?? '',
  rect: (n) => {
    const [x, y, width, height] = [n('x', '0'), n('y', '0'), n('width'), n('height')];
    const given = (name: string) => (n(name, '-1') >= 0 ? n(name) : null);
    const rx = Math.min(given('rx') ?? given('ry') ?? 0, width / 2);
    const ry = Math.min(given('ry') ?? given('rx') ?? 0, height / 2);
    const f = format;

    if (!rx || !ry) return `M${f(x)},${f(y)}h${f(width)}v${f(height)}h${f(-width)}z`;

    return (
      `M${f(x + rx)},${f(y)}h${f(width - 2 * rx)}a${f(rx)},${f(ry)} 0 0 1 ${f(rx)},${f(ry)}` +
      `v${f(height - 2 * ry)}a${f(rx)},${f(ry)} 0 0 1 ${f(-rx)},${f(ry)}` +
      `h${f(2 * rx - width)}a${f(rx)},${f(ry)} 0 0 1 ${f(-rx)},${f(-ry)}` +
      `v${f(2 * ry - height)}a${f(rx)},${f(ry)} 0 0 1 ${f(rx)},${f(-ry)}z`
    );
  },
  circle: (n) => ellipse(n('cx', '0'), n('cy', '0'), n('r'), n('r')),
  ellipse: (n) => ellipse(n('cx', '0'), n('cy', '0'), n('rx'), n('ry')),
  line: (n) =>
    `M${format(n('x1', '0'))},${format(n('y1', '0'))}L${format(n('x2', '0'))},${format(n('y2', '0'))}`,
  polyline: (_n, element) => points(element, false),
  polygon: (_n, element) => points(element, true),
};

function ellipse(cx: number, cy: number, rx: number, ry: number) {
  const f = format;

  return (
    `M${f(cx - rx)},${f(cy)}a${f(rx)},${f(ry)} 0 1 0 ${f(2 * rx)},0` +
    `a${f(rx)},${f(ry)} 0 1 0 ${f(-2 * rx)},0z`
  );
}

function points(element: Element, closed: boolean) {
  const values = (element.attributes.points ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const pairs: string[] = [];

  for (let index = 0; index + 1 < values.length; index += 2)
    pairs.push(
      `${format(number(values[index], 'points'))},${format(number(values[index + 1], 'points'))}`,
    );

  return pairs.length ? `M${pairs.join('L')}${closed ? 'z' : ''}` : '';
}

/** An affine transform as SVG's matrix(a b c d e f): x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(p: Matrix, q: Matrix): Matrix {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Each SVG transform function as its matrix. */
const TRANSFORMS: Readonly<Record<string, (args: number[]) => Matrix>> = {
  matrix: ([a = 1, b = 0, c = 0, d = 1, e = 0, f = 0]) => [a, b, c, d, e, f],
  translate: ([x = 0, y = 0]) => [1, 0, 0, 1, x, y],
  scale: ([x = 1, y = x]) => [x, 0, 0, y, 0, 0],
  rotate: ([degrees = 0, cx = 0, cy = 0]) => {
    const cos = Math.cos(radians(degrees));
    const sin = Math.sin(radians(degrees));

    return multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [
      1,
      0,
      0,
      1,
      -cx,
      -cy,
    ]);
  },
  skewX: ([degrees = 0]) => [1, 0, Math.tan(radians(degrees)), 1, 0, 0],
  skewY: ([degrees = 0]) => [1, Math.tan(radians(degrees)), 0, 1, 0, 0],
};

/** A transform attribute's functions, applied left to right, as one matrix. */
export function transformOf(transform: string | undefined): Matrix {
  let matrix = IDENTITY;

  for (const [, name, args] of (transform ?? '').matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const make = TRANSFORMS[name];

    if (!make) throw new Error(`a ${name}() transform`);

    matrix = multiply(
      matrix,
      make(
        args
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((value) => number(value, name)),
      ),
    );
  }

  return matrix;
}

export interface GradientStop {
  /** Where the stop sits along the gradient, 0–1, never before the one before it. */
  offset: number;
  hex: string;
  alpha: number;
}

interface GradientBase {
  /** Whether its coordinates are fractions of the painted shape's box, or the shape's own. */
  units: 'objectBoundingBox' | 'userSpaceOnUse';
  transform: Matrix;
  spread: 'pad' | 'reflect' | 'repeat';
  stops: GradientStop[];
}

export type Gradient = GradientBase &
  (
    | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'radial'; cx: number; cy: number; r: number; fx: number; fy: number }
  );

/** What an element takes from the gradient its `href` names, unless it says otherwise. */
const GRADIENT_ATTRIBUTES = [
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'fx',
  'fy',
] as const;

const KINDS: Readonly<Record<string, Gradient['kind']>> = {
  linearGradient: 'linear',
  radialGradient: 'radial',
};

export function oneOf<T extends string>(key: string, value: string, values: readonly T[]): T {
  const found = values.find((each) => each === value);

  if (found === undefined) throw new Error(`${key}="${value}"`);

  return found;
}

/**
 * Every gradient in the file by id, wherever it is defined: its own
 * attributes over those of the gradient its `href` names, and that one's
 * stops when it has none. `viewport` is what a percentage in user space is
 * of.
 */
export function gradients(
  svg: Element,
  viewport: readonly [width: number, height: number],
): ReadonlyMap<string, Gradient> {
  const defined = new Map<string, Element>();
  const visit = (element: Element) => {
    if (KINDS[element.name] && element.attributes.id) defined.set(element.attributes.id, element);

    element.children.forEach(visit);
  };

  visit(svg);

  const resolve = (
    element: Element,
    seen: ReadonlySet<Element>,
  ): { attributes: Record<string, string>; stops: Element[] } => {
    const own = element.children.filter((child) => child.name === 'stop');
    const reference = (element.attributes.href ?? element.attributes['xlink:href'] ?? '').trim();
    const target = reference.startsWith('#') ? defined.get(reference.slice(1)) : undefined;

    if (!target || seen.has(target)) return { attributes: element.attributes, stops: own };

    const inherited = resolve(target, new Set([...seen, element]));
    const attributes = { ...element.attributes };

    for (const key of GRADIENT_ATTRIBUTES)
      if (attributes[key] === undefined && inherited.attributes[key] !== undefined)
        attributes[key] = inherited.attributes[key];

    return { attributes, stops: own.length ? own : inherited.stops };
  };

  const result = new Map<string, Gradient>();

  for (const [id, element] of defined) {
    const { attributes, stops } = resolve(element, new Set());
    const units = oneOf('gradientUnits', attributes.gradientUnits ?? 'objectBoundingBox', [
      'objectBoundingBox',
      'userSpaceOnUse',
    ] as const);
    // A coordinate: in the box, a fraction (50% or .5); in user space, a length,
    // or a percentage of the viewport's width, height or their diagonal.
    const length = (key: string, fallback: string, of: 'x' | 'y' | 'diagonal') => {
      const value = (attributes[key] ?? fallback).trim();

      if (!value.endsWith('%')) return number(value, key);

      const fraction = number(value.slice(0, -1), key) / 100;

      if (units === 'objectBoundingBox') return fraction;

      const [width, height] = viewport;

      return (
        fraction * { x: width, y: height, diagonal: Math.hypot(width, height) / Math.SQRT2 }[of]
      );
    };
    const base: GradientBase = {
      units,
      transform: transformOf(attributes.gradientTransform),
      spread: oneOf('spreadMethod', attributes.spreadMethod ?? 'pad', [
        'pad',
        'reflect',
        'repeat',
      ] as const),
      stops: stopsOf(stops),
    };

    if (KINDS[element.name] === 'linear') {
      result.set(id, {
        ...base,
        kind: 'linear',
        x1: length('x1', '0%', 'x'),
        y1: length('y1', '0%', 'y'),
        x2: length('x2', '100%', 'x'),
        y2: length('y2', '0%', 'y'),
      });
    } else {
      const cx = length('cx', '50%', 'x');
      const cy = length('cy', '50%', 'y');

      result.set(id, {
        ...base,
        kind: 'radial',
        cx,
        cy,
        r: length('r', '50%', 'diagonal'),
        fx: attributes.fx === undefined ? cx : length('fx', '50%', 'x'),
        fy: attributes.fy === undefined ? cy : length('fy', '50%', 'y'),
      });
    }
  }

  return result;
}

/** A gradient's stops: each offset clamped and kept in order, its opacity folded in. */
function stopsOf(stops: readonly Element[]): GradientStop[] {
  let previous = 0;

  return stops.map((stop) => {
    const own = declared(stop);
    const text = (own.offset ?? '0').trim();
    const given = text.endsWith('%')
      ? number(text.slice(0, -1), 'offset') / 100
      : number(text, 'offset');
    const offset = Math.max(previous, Math.min(1, Math.max(0, given)));
    const paint = color(own['stop-color'] ?? '#000000');

    previous = offset;

    return {
      offset,
      hex: paint?.hex ?? '#000000',
      alpha: (paint?.alpha ?? 0) * number(own['stop-opacity'] ?? '1', 'stop-opacity'),
    };
  });
}
