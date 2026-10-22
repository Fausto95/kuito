// Kuito's native style vocabulary, shared by .css modules and styles().
// Each property parses a CSS-like value into native props: plain data out,
// no I/O. Lengths are platform points (pt/dp); `em` stays a font-relative
// instruction resolved at render time. The props a property writes are
// src/protocol/manifest.ts's, by name.
import type { NativePropName } from '../protocol/manifest.ts';
import { ColorError, isColorFunction, looksLikeColor, parseColor } from './colors.ts';

export class StyleValueError extends Error {}

/** A declaration value: CSS text, or a compile-time literal from styles(). */
export type StyleInput = string | number | boolean | null;

export interface StyleContext {
  rootFontSize?: number;
}

interface EmLength {
  __kuitoLength: 'em';
  factor: number;
}

type Length = number | EmLength;

type Easing = number[];

type TimingCurve =
  | { type: 'timing'; easing: Easing }
  | { type: 'spring'; damping: number; stiffness: number; mass: number };

type Transition =
  | { type: 'timing'; duration: number; easing: Easing; delay: number }
  | { type: 'spring'; damping: number; stiffness: number; mass: number; delay: number };

interface Gradient {
  angle: number;
  colors: string[];
}

type NativeValue = string | number | boolean | EmLength | Gradient | Record<string, Transition>;

export type NativeProps = Partial<Record<NativePropName, NativeValue>>;

type Expand = (raw: StyleInput, context: StyleContext) => NativeProps;
type Parse = (raw: StyleInput, property: string, context: StyleContext) => NativeValue;

function fail(message: string): never {
  throw new StyleValueError(message);
}

/** Own entries only: user text must never select an Object.prototype member. */
function lookup<T>(table: Partial<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

const MEASURE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]*)$/i;

function measure(text: StyleInput, property: string) {
  const match = MEASURE.exec(String(text).trim());

  if (!match) fail(`${property} requires a number, got "${text}"`);

  const value = Number.parseFloat(match[1]);

  if (!Number.isFinite(value)) fail(`${property} must be finite`);

  return { value, unit: match[2].toLowerCase() };
}

export function length(
  raw: StyleInput,
  property: string,
  { rootFontSize = 16 }: StyleContext = {},
): Length {
  if (typeof raw === 'number') return raw;

  const { value, unit } = measure(raw, property);

  if (!unit || unit === 'px' || unit === 'dp') return value;
  if (unit === 'rem') return value * rootFontSize;
  if (unit === 'em') return { __kuitoLength: 'em', factor: value };

  return fail(`Unsupported length unit "${unit}" for ${property}. Use px, rem or em.`);
}

function unitless(raw: StyleInput, property: string) {
  if (typeof raw === 'number') return raw;

  const { value, unit } = measure(raw, property);

  if (unit) fail(`${property} is unitless, got "${raw}"`);

  return value;
}

function time(raw: StyleInput, property: string) {
  if (typeof raw === 'number') return raw;

  const { value, unit } = measure(raw, property);

  if (!unit || unit === 'ms') return value;
  if (unit === 's') return value * 1000;

  return fail(`${property} requires ms or s`);
}

function angle(raw: StyleInput, property: string) {
  if (typeof raw === 'number') return raw;

  const { value, unit } = measure(raw, property);
  const units: Partial<Record<string, number>> = { '': 1, deg: 1, rad: 180 / Math.PI, turn: 360 };
  const degrees = lookup(units, unit);

  if (degrees === undefined) fail(`${property} requires deg, rad or turn, got "${raw}"`);

  return value * degrees;
}

/** The value as text; a quoted string loses its quotes and escapes, as CSS reads it. */
const text = (raw: StyleInput) =>
  String(raw)
    .trim()
    .replace(/^(['"])(.*)\1$/s, (_, _quote: string, inner: string) =>
      inner.replace(/\\(.)/gs, '$1'),
    );

function oneOf(property: string, values: string[], aliases: Record<string, string> = {}) {
  return (raw: StyleInput) => {
    const value = lookup(aliases, text(raw)) ?? text(raw);

    if (!values.includes(value)) fail(`${property} must be one of ${values.join(', ')}`);

    return value;
  };
}

/** Split at `separator` outside parentheses: "a(1, 2), b" → ["a(1, 2)", "b"]. */
function splitTop(value: StyleInput, separator: string) {
  const parts: string[] = [];
  let depth = 0,
    current = '';

  for (const char of String(value)) {
    if (char === '(') depth++;
    if (char === ')') depth--;

    if (depth === 0 && (separator === ' ' ? /\s/.test(char) : char === separator)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else current += char;
  }

  if (current.trim()) parts.push(current.trim());

  return parts;
}

const call = (value: StyleInput) => /^([a-zA-Z-]+)\((.*)\)$/.exec(String(value).trim());

/** Any CSS color, compiled to the hex both renderers parse. */
function color(raw: StyleInput): string {
  try {
    return parseColor(text(raw));
  } catch (error) {
    if (error instanceof ColorError) fail(error.message);
    throw error;
  }
}

const isColor = (token: string) => looksLikeColor(token) && !MEASURE.test(token);

// --- Ranges ------------------------------------------------------------------

const isEm = (value: NativeValue): value is EmLength =>
  typeof value === 'object' && Reflect.get(value, '__kuitoLength') === 'em';

/** A length a negative value would make meaningless: padding, sizes, radii. */
function nonNegative(parse: Parse): Parse {
  return (raw, property, context) => {
    const value = parse(raw, property, context);
    const amount =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : isEm(value)
            ? value.factor
            : 0;

    if (amount < 0) fail(`${property} must not be negative`);

    return value;
  };
}

function between(min: number, max: number): Parse {
  return (raw, property) => {
    const value = unitless(raw, property);

    if (!(value >= min && value <= max)) fail(`${property} must be between ${min} and ${max}`);

    return value;
  };
}

// --- Layout values ---------------------------------------------------------

const SIZE_KEYWORDS = ['auto', 'min-content', 'max-content', 'fit-content', 'stretch', 'content'];

/** A length or a percentage; percentages cross to native as "50%". */
function lengthPercentage(raw: StyleInput, property: string, context: StyleContext): NativeValue {
  if (typeof raw !== 'number' && measure(raw, property).unit === '%') return text(raw);

  return length(raw, property, context);
}

function lengthPercentageAuto(
  raw: StyleInput,
  property: string,
  context: StyleContext,
): NativeValue {
  return text(raw) === 'auto' ? 'auto' : lengthPercentage(raw, property, context);
}

/** width, height and flex-basis: also auto and the CSS sizing keywords. */
function size(raw: StyleInput, property: string, context: StyleContext): NativeValue {
  const value = text(raw);

  if (SIZE_KEYWORDS.includes(value)) return value;

  const fit = /^fit-content\((.*)\)$/.exec(value);

  if (fit) {
    const inner = lengthPercentage(fit[1] ?? '', property, context);

    return `fit-content(${typeof inner === 'string' || typeof inner === 'number' ? inner : fail('fit-content needs px, rem or %')})`;
  }

  return lengthPercentage(raw, property, context);
}

/** 1 to 4 values, top-right-bottom-left like CSS's box sides. */
function sides(
  raw: StyleInput,
  property: string,
  names: readonly [NativePropName, NativePropName, NativePropName, NativePropName],
  parse: Parse,
  context: StyleContext,
): NativeProps {
  const values =
    typeof raw === 'number'
      ? [raw]
      : splitTop(raw, ' ').map((part) => parse(part, property, context));

  if (values.length < 1 || values.length > 4) fail(`${property} takes 1 to 4 values`);

  const [top, right = top, bottom = top, left = right] = values;

  const props: NativeProps = {};

  const ordered = [top, right, bottom, left];

  names.forEach((name, index) => {
    props[name] = ordered[index];
  });

  return props;
}

/** `flex: 1`, `flex: none`, `flex: 2 0 120px`, like CSS. */
function flex(raw: StyleInput, context: StyleContext): NativeProps {
  const value = text(raw);

  if (value === 'none') return { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' };
  if (value === 'auto') return { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' };

  const parts = typeof raw === 'number' ? [String(raw)] : splitTop(raw, ' ');
  const numbers = parts.filter((part) => /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(part));
  const basis = parts.find((part) => !numbers.includes(part));

  if (parts.length > 3 || numbers.length < 1)
    fail('flex takes a grow factor, an optional shrink factor and a basis');

  return {
    flexGrow: Number(numbers[0]),
    flexShrink: numbers[1] === undefined ? 1 : Number(numbers[1]),
    flexBasis: basis === undefined ? '0%' : size(basis, 'flex', context),
  };
}

function flexFlow(raw: StyleInput): NativeProps {
  const props: NativeProps = {};

  for (const part of splitTop(raw, ' ')) {
    if (FLEX_DIRECTIONS.includes(part)) props.flexDirection = part;
    else if (FLEX_WRAPS.includes(part)) props.flexWrap = part;
    else fail(`flex-flow takes a direction and a wrap, got "${part}"`);
  }

  return props;
}

const FLEX_DIRECTIONS = ['row', 'column', 'row-reverse', 'column-reverse'];
const FLEX_WRAPS = ['nowrap', 'wrap', 'wrap-reverse', 'balance'];
const SELF_ALIGNMENTS = [
  'normal',
  'start',
  'end',
  'flex-start',
  'flex-end',
  'center',
  'baseline',
  'stretch',
  'self-start',
  'self-end',
];
const CONTENT_ALIGNMENTS = [
  'normal',
  'start',
  'end',
  'flex-start',
  'flex-end',
  'center',
  'stretch',
  'space-between',
  'space-around',
  'space-evenly',
];

/** An alignment keyword, optionally with CSS's `safe` or `unsafe`. */
function alignment(property: string, keywords: string[]) {
  return (raw: StyleInput) => {
    const parts = text(raw).split(/\s+/);
    const [modifier, keyword] = parts.length === 2 ? parts : [undefined, parts[0]];

    if (
      parts.length > 2 ||
      (modifier !== undefined && modifier !== 'safe' && modifier !== 'unsafe') ||
      !keywords.includes(keyword ?? '')
    )
      fail(`${property} must be one of ${keywords.join(', ')}, optionally after safe or unsafe`);

    return parts.join(' ');
  };
}

const spacing = nonNegative(lengthPercentage);

/** padding-inline and its kin: a start and an optional end, as CSS's logical shorthands. */
function startEnd(
  raw: StyleInput,
  property: string,
  names: readonly [NativePropName, NativePropName],
  parse: Parse,
  context: StyleContext,
): NativeProps {
  const values =
    typeof raw === 'number'
      ? [parse(raw, property, context)]
      : splitTop(raw, ' ').map((part) => parse(part, property, context));

  if (values.length < 1 || values.length > 2) fail(`${property} takes one or two values`);

  const [start, end = start] = values;
  const [startName, endName] = names;

  return { ...one(startName, start), ...one(endName, end) };
}

function gap(raw: StyleInput, context: StyleContext): NativeProps {
  const values =
    typeof raw === 'number'
      ? [spacing(raw, 'gap', context)]
      : splitTop(raw, ' ').map((part) => spacing(part, 'gap', context));

  if (values.length < 1 || values.length > 2)
    fail('gap takes a row gap and an optional column gap');

  const [row, column = row] = values;

  return { rowGap: row, columnGap: column };
}

function aspectRatio(raw: StyleInput): NativeProps {
  const [width, height = '1'] = String(raw)
    .split('/')
    .map((part) => part.trim());
  const ratio = Number(width) / Number(height);

  if (!(ratio > 0) || !Number.isFinite(ratio))
    fail('aspect-ratio must be a positive ratio, like 16 / 9');

  return { aspectRatio: ratio };
}

// --- Shorthands -----------------------------------------------------------

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];

/** A width, a style and a color, each at most once and in any order, as CSS takes them. */
function border(raw: StyleInput, context: StyleContext): NativeProps {
  if (text(raw) === 'none') return { borderWidth: 0 };

  const result: NativeProps = {};
  let styled = false;

  for (const token of typeof raw === 'number' ? [String(raw)] : splitTop(raw, ' ')) {
    if (BORDER_STYLES.includes(token)) {
      if (token !== 'solid') fail('Only solid borders are supported');
      if (styled) fail('border takes one style');
      styled = true;
    } else if (isColor(token)) {
      if (result.borderColor !== undefined) fail('border takes one color');
      result.borderColor = color(token);
    } else {
      if (result.borderWidth !== undefined) fail('border takes one width');
      result.borderWidth = nonNegative(length)(token, 'borderWidth', context);
    }
  }

  return result;
}

function boxShadow(raw: StyleInput, context: StyleContext): NativeProps {
  if (text(raw) === 'none')
    return { shadowColor: '#00000000', shadowRadius: 0, shadowOffsetX: 0, shadowOffsetY: 0 };

  if (splitTop(raw, ',').length > 1) fail('box-shadow supports a single shadow');

  const tokens = splitTop(raw, ' ');
  const shade = tokens.find(isColor);
  const lengths = tokens
    .filter((token) => token !== shade && token !== 'inset')
    .map((token) => length(token, 'box-shadow', context));

  if (tokens.includes('inset')) fail('inset box-shadow is not supported');

  if (lengths.length < 2 || lengths.length > 3)
    fail('box-shadow requires offset-x offset-y [blur] color');

  // CSS blur is twice the Gaussian radius that UIKit and Android take.
  const blur = lengths[2] ?? 0;

  if ((typeof blur === 'number' ? blur : blur.factor) < 0)
    fail('box-shadow blur must not be negative');

  return {
    shadowOffsetX: lengths[0],
    shadowOffsetY: lengths[1],
    shadowRadius: typeof blur === 'number' ? blur / 2 : { ...blur, factor: blur.factor / 2 },
    shadowColor: shade === undefined ? '#000000' : color(shade),
  };
}

const DIRECTIONS: Partial<Record<string, number>> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
  'top right': 45,
  'right top': 45,
  'bottom right': 135,
  'right bottom': 135,
  'bottom left': 225,
  'left bottom': 225,
  'top left': 315,
  'left top': 315,
};

function background(raw: StyleInput): NativeProps {
  const fn = call(raw);

  if (!fn || isColorFunction(fn[1])) return { backgroundColor: color(raw) };

  if (fn[1] !== 'linear-gradient')
    fail(`background supports a color or linear-gradient(), got ${fn[1]}()`);

  const args = splitTop(fn[2], ',');
  const [first] = args;
  let degrees = 180;

  if (/^to\s/.test(first)) {
    args.shift();

    const direction = lookup(DIRECTIONS, first.slice(3).trim());

    if (direction === undefined)
      fail('linear-gradient direction must be to top, right, bottom, left or a corner');

    degrees = direction;
  } else if (MEASURE.test(first)) {
    args.shift();
    degrees = angle(first, 'linear-gradient');
  }

  if (args.length < 2) fail('linear-gradient requires at least two colors');

  if (args.some((color) => splitTop(color, ' ').length > 1))
    fail('linear-gradient color stops are not supported; list colors only');

  return { backgroundGradient: { angle: degrees, colors: args.map(color) } };
}

const TRANSFORMS: Partial<Record<string, (args: string[], context: StyleContext) => NativeProps>> =
  {
    translate: (args, context) => ({
      translateX: length(args[0], 'translate', context),
      translateY: length(args[1] ?? 0, 'translate', context),
    }),
    translateX: ([x], context) => ({ translateX: length(x, 'translateX', context) }),
    translateY: ([y], context) => ({ translateY: length(y, 'translateY', context) }),
    scale: ([x, y]): NativeProps =>
      y === undefined
        ? { scale: unitless(x, 'scale') }
        : { scaleX: unitless(x, 'scale'), scaleY: unitless(y, 'scale') },
    scaleX: ([x]) => ({ scaleX: unitless(x, 'scaleX') }),
    scaleY: ([y]) => ({ scaleY: unitless(y, 'scaleY') }),
    rotate: ([a]) => ({ rotate: angle(a, 'rotate') }),
  };

function transform(raw: StyleInput, context: StyleContext): NativeProps {
  if (text(raw) === 'none')
    return { translateX: 0, translateY: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0 };

  return Object.assign(
    {},
    ...splitTop(raw, ' ').map((part) => {
      const fn = call(part);
      const parse = fn ? lookup(TRANSFORMS, fn[1]) : undefined;

      if (!fn || !parse) fail(`Unsupported transform ${fn ? fn[1] : part}`);

      return parse(splitTop(fn[2], ','), context);
    }),
  );
}

// --- Transitions: the animation spec shared with timing/spring -----

export const EASINGS: Readonly<Record<string, Easing>> = Object.freeze({
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
});

/** Properties the native renderers animate; `transform` covers every transform prop. */
const ANIMATABLE: Partial<Record<string, string>> = {
  opacity: 'opacity',
  'background-color': 'backgroundColor',
  backgroundColor: 'backgroundColor',
  transform: 'transform',
  'border-radius': 'borderRadius',
  borderRadius: 'borderRadius',
  'border-color': 'borderColor',
  borderColor: 'borderColor',
  'box-shadow': 'shadow',
  width: 'width',
  height: 'height',
  all: 'all',
};

function timingFunction(token: string): TimingCurve {
  const named = lookup(EASINGS, token);

  if (named) return { type: 'timing', easing: named };

  const fn = call(token);

  if (fn?.[1] === 'cubic-bezier') {
    const points = splitTop(fn[2], ',').map(Number);

    if (points.length !== 4 || points.some(Number.isNaN)) fail('cubic-bezier() takes four numbers');

    return { type: 'timing', easing: points };
  }

  if (fn?.[1] === 'spring') {
    const [damping, stiffness, mass = 1] = splitTop(fn[2], ',').map(Number);

    if ([damping, stiffness, mass].some((value) => !(value > 0)))
      fail('spring() takes positive damping, stiffness and optional mass');

    return { type: 'spring', damping, stiffness, mass };
  }

  return fail(`Unknown timing function ${token}`);
}

function transition(raw: StyleInput): NativeProps {
  const groups: Record<string, Transition> = {};

  for (const item of splitTop(raw, ',')) {
    const [name, ...rest] = splitTop(item, ' ');
    const key = lookup(ANIMATABLE, name);

    if (!key)
      fail(
        `${name} cannot be animated natively; use opacity, background-color, transform, ` +
          'border-radius, border-color, box-shadow, width, height or all',
      );

    const times = rest
      .filter((token) => MEASURE.test(token))
      .map((token) => time(token, 'transition'));
    const curve = rest.filter((token) => !MEASURE.test(token));
    const timing: TimingCurve = curve.length
      ? timingFunction(curve.join(' '))
      : { type: 'timing', easing: EASINGS.ease };
    const [duration = 0, delay = 0] = times;

    groups[key] =
      timing.type === 'spring'
        ? { ...timing, delay: times.length > 1 ? delay : 0 }
        : { type: 'timing', duration, easing: timing.easing, delay };
  }

  return { transition: groups };
}

// --- The table --------------------------------------------------------------

/**
 * Rows of docs/styles.md's property table (src/style/docs.ts), in order:
 * what the properties in each take.
 */
export const STYLE_CATEGORIES = {
  background: 'color, or `linear-gradient(<angle> \\| to <side>, color, color, …)`',
  color: 'color ([colors](#colors))',
  opacity: '0–1',
  padding: '1–4 non-negative lengths, like CSS',
  paddingSides: 'non-negative length',
  logicalSides:
    'a start and an optional end, as their physical sides take; see [Right to left](#right-to-left)',
  size: 'see [Layout](#layout)',
  position: 'see [Layout](#layout)',
  flexbox: 'see [Layout](#layout)',
  layoutShorthands: 'see [Layout](#layout)',
  display: '`none`, `flex`; `hidden` takes `true` or `false`',
  border: '`<width> solid <color>`, in any order, each at most once; or `none`',
  borderParts: 'non-negative length / color',
  shadow: '`<x> <y> [blur] <color>`; blur is halved into the native radius',
  shadowParts: 'color / length',
  textLength: 'length',
  lineHeight: 'length, or a unitless multiple of the font size',
  fontWeight: '`normal`, `bold`, `100`–`900`',
  font: 'a system, bundled or loaded family ([fonts](fonts.md)); `normal`, `italic`',
  textKeywords: '`left`/`center`/`right`; `none`/`uppercase`/`lowercase`/`capitalize`',
  lineClamp: 'whole number (`0` = unlimited)',
  transform:
    '`translate()`, `translateX/Y()`, `scale()`, `scaleX/Y()`, `rotate(deg\\|rad\\|turn)`, `none`',
  transformParts: 'length; a number; an angle (`deg`, `rad`, `turn`)',
  transition: 'see [Transitions](#transitions)',
} as const;

export type StyleCategory = keyof typeof STYLE_CATEGORIES;

/** A CSS property: the native props it may write, how, and its docs row. */
export interface StyleProperty {
  native: readonly NativePropName[];
  parse: Expand;
  category: StyleCategory;
}

function one(prop: NativePropName, value: NativeValue): NativeProps {
  const props: NativeProps = {};

  props[prop] = value;

  return props;
}

const as = (prop: NativePropName, parse: Parse, category: StyleCategory): StyleProperty => ({
  native: [prop],
  parse: (raw, context) => one(prop, parse(raw, prop, context)),
  category,
});
const lengthProp = (prop: NativePropName, category: StyleCategory) => as(prop, length, category);
const extent = (prop: NativePropName, category: StyleCategory) =>
  as(prop, nonNegative(length), category);
const colorProp = (prop: NativePropName, category: StyleCategory) =>
  as(prop, (raw) => color(raw), category);

const fontWeight = (raw: StyleInput): NativeProps => {
  const weights: Partial<Record<string, number>> = { normal: 400, bold: 700 };
  const named = lookup(weights, text(raw));
  const weight = named ?? Number(raw);

  if (!(weight >= 100 && weight <= 900 && weight % 100 === 0))
    fail('font-weight must be normal, bold or 100-900 in steps of 100');

  return { fontWeight: weight };
};

const lineHeight = (raw: StyleInput, context: StyleContext): NativeProps => {
  if (typeof raw === 'number') return { lineHeight: raw };

  const { unit } = measure(raw, 'line-height');

  return {
    lineHeight: nonNegative((value) =>
      unit
        ? length(value, 'line-height', context)
        : { __kuitoLength: 'em', factor: unitless(value, 'line-height') },
    )(raw, 'lineHeight', context),
  };
};

const lines = (raw: StyleInput): NativeProps => {
  const count = unitless(raw, 'line clamp');

  if (!Number.isInteger(count) || count < 0) fail('line clamp must be a whole number');

  return { lineClamp: count };
};

const SIDES = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;
const sized = nonNegative(size);
const INSETS = ['top', 'right', 'bottom', 'left'] as const;
const MARGINS = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const;
const PADDING_INLINE = ['paddingInlineStart', 'paddingInlineEnd'] as const;
const PADDING_BLOCK = ['paddingTop', 'paddingBottom'] as const;
const MARGIN_INLINE = ['marginInlineStart', 'marginInlineEnd'] as const;
const MARGIN_BLOCK = ['marginTop', 'marginBottom'] as const;
const INSET_INLINE = ['insetInlineStart', 'insetInlineEnd'] as const;
const INSET_BLOCK = ['top', 'bottom'] as const;
const SHADOW = ['shadowOffsetX', 'shadowOffsetY', 'shadowRadius', 'shadowColor'] as const;
const TRANSFORM = ['translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate'] as const;

const PROPERTIES = {
  'background-color': colorProp('backgroundColor', 'color'),
  background: {
    native: ['backgroundColor', 'backgroundGradient'],
    parse: background,
    category: 'background',
  },
  color: colorProp('color', 'color'),
  opacity: as('opacity', between(0, 1), 'opacity'),
  padding: {
    native: SIDES,
    parse: (raw, context) => sides(raw, 'padding', SIDES, nonNegative(length), context),
    category: 'padding',
  },
  'padding-top': extent('paddingTop', 'paddingSides'),
  'padding-right': extent('paddingRight', 'paddingSides'),
  'padding-bottom': extent('paddingBottom', 'paddingSides'),
  'padding-left': extent('paddingLeft', 'paddingSides'),
  'padding-horizontal': {
    native: ['paddingLeft', 'paddingRight'],
    parse: (raw, context) => ({
      paddingLeft: nonNegative(length)(raw, 'padding', context),
      paddingRight: nonNegative(length)(raw, 'padding', context),
    }),
    category: 'paddingSides',
  },
  'padding-vertical': {
    native: ['paddingTop', 'paddingBottom'],
    parse: (raw, context) => ({
      paddingTop: nonNegative(length)(raw, 'padding', context),
      paddingBottom: nonNegative(length)(raw, 'padding', context),
    }),
    category: 'paddingSides',
  },
  'padding-inline': {
    native: PADDING_INLINE,
    parse: (raw, context) =>
      startEnd(raw, 'padding-inline', PADDING_INLINE, nonNegative(length), context),
    category: 'logicalSides',
  },
  'padding-inline-start': extent('paddingInlineStart', 'logicalSides'),
  'padding-inline-end': extent('paddingInlineEnd', 'logicalSides'),
  'padding-block': {
    native: PADDING_BLOCK,
    parse: (raw, context) =>
      startEnd(raw, 'padding-block', PADDING_BLOCK, nonNegative(length), context),
    category: 'logicalSides',
  },
  'padding-block-start': extent('paddingTop', 'logicalSides'),
  'padding-block-end': extent('paddingBottom', 'logicalSides'),
  gap: { native: ['rowGap', 'columnGap'], parse: gap, category: 'size' },
  'row-gap': as('rowGap', spacing, 'size'),
  'column-gap': as('columnGap', spacing, 'size'),
  width: as('width', sized, 'size'),
  height: as('height', sized, 'size'),
  'min-width': as('minWidth', sized, 'size'),
  'max-width': as('maxWidth', sized, 'size'),
  'min-height': as('minHeight', sized, 'size'),
  'max-height': as('maxHeight', sized, 'size'),
  'aspect-ratio': { native: ['aspectRatio'], parse: aspectRatio, category: 'size' },
  overflow: as('overflow', oneOf('overflow', ['visible', 'hidden', 'clip', 'scroll']), 'position'),
  direction: as('direction', oneOf('direction', ['ltr', 'rtl']), 'position'),
  'box-sizing': as('boxSizing', oneOf('box-sizing', ['border-box', 'content-box']), 'position'),
  position: as('position', oneOf('position', ['relative', 'absolute']), 'position'),
  top: as('top', lengthPercentageAuto, 'position'),
  right: as('right', lengthPercentageAuto, 'position'),
  bottom: as('bottom', lengthPercentageAuto, 'position'),
  left: as('left', lengthPercentageAuto, 'position'),
  'inset-inline': {
    native: INSET_INLINE,
    parse: (raw, context) =>
      startEnd(raw, 'inset-inline', INSET_INLINE, lengthPercentageAuto, context),
    category: 'logicalSides',
  },
  'inset-inline-start': as('insetInlineStart', lengthPercentageAuto, 'logicalSides'),
  'inset-inline-end': as('insetInlineEnd', lengthPercentageAuto, 'logicalSides'),
  'inset-block': {
    native: INSET_BLOCK,
    parse: (raw, context) =>
      startEnd(raw, 'inset-block', INSET_BLOCK, lengthPercentageAuto, context),
    category: 'logicalSides',
  },
  'inset-block-start': as('top', lengthPercentageAuto, 'logicalSides'),
  'inset-block-end': as('bottom', lengthPercentageAuto, 'logicalSides'),
  inset: {
    native: INSETS,
    parse: (raw, context) => sides(raw, 'inset', INSETS, lengthPercentageAuto, context),
    category: 'layoutShorthands',
  },
  margin: {
    native: MARGINS,
    parse: (raw, context) => sides(raw, 'margin', MARGINS, lengthPercentageAuto, context),
    category: 'layoutShorthands',
  },
  'margin-top': as('marginTop', lengthPercentageAuto, 'position'),
  'margin-right': as('marginRight', lengthPercentageAuto, 'position'),
  'margin-bottom': as('marginBottom', lengthPercentageAuto, 'position'),
  'margin-left': as('marginLeft', lengthPercentageAuto, 'position'),
  'margin-horizontal': {
    native: ['marginLeft', 'marginRight'],
    parse: (raw, context) => ({
      marginLeft: lengthPercentageAuto(raw, 'margin-horizontal', context),
      marginRight: lengthPercentageAuto(raw, 'margin-horizontal', context),
    }),
    category: 'layoutShorthands',
  },
  'margin-inline': {
    native: MARGIN_INLINE,
    parse: (raw, context) =>
      startEnd(raw, 'margin-inline', MARGIN_INLINE, lengthPercentageAuto, context),
    category: 'logicalSides',
  },
  'margin-inline-start': as('marginInlineStart', lengthPercentageAuto, 'logicalSides'),
  'margin-inline-end': as('marginInlineEnd', lengthPercentageAuto, 'logicalSides'),
  'margin-block': {
    native: MARGIN_BLOCK,
    parse: (raw, context) =>
      startEnd(raw, 'margin-block', MARGIN_BLOCK, lengthPercentageAuto, context),
    category: 'logicalSides',
  },
  'margin-block-start': as('marginTop', lengthPercentageAuto, 'logicalSides'),
  'margin-block-end': as('marginBottom', lengthPercentageAuto, 'logicalSides'),
  'margin-vertical': {
    native: ['marginTop', 'marginBottom'],
    parse: (raw, context) => ({
      marginTop: lengthPercentageAuto(raw, 'margin-vertical', context),
      marginBottom: lengthPercentageAuto(raw, 'margin-vertical', context),
    }),
    category: 'layoutShorthands',
  },
  flex: {
    native: ['flexGrow', 'flexShrink', 'flexBasis'],
    parse: flex,
    category: 'layoutShorthands',
  },
  'flex-flow': {
    native: ['flexDirection', 'flexWrap'],
    parse: flexFlow,
    category: 'layoutShorthands',
  },
  'flex-direction': as('flexDirection', oneOf('flex-direction', FLEX_DIRECTIONS), 'flexbox'),
  'flex-wrap': as('flexWrap', oneOf('flex-wrap', FLEX_WRAPS), 'flexbox'),
  'flex-grow': as('flexGrow', unitless, 'flexbox'),
  'flex-shrink': as('flexShrink', unitless, 'flexbox'),
  'flex-basis': as('flexBasis', sized, 'flexbox'),
  'flex-line-count': {
    native: ['flexLineCount'],
    parse: (raw) => {
      const count = unitless(raw, 'flex-line-count');

      if (!Number.isInteger(count) || count < 1)
        fail('flex-line-count must be a whole number of at least 1');

      return { flexLineCount: count };
    },
    category: 'flexbox',
  },
  'align-items': as('alignItems', alignment('align-items', SELF_ALIGNMENTS), 'flexbox'),
  'align-self': as('alignSelf', alignment('align-self', ['auto', ...SELF_ALIGNMENTS]), 'flexbox'),
  'align-content': as('alignContent', alignment('align-content', CONTENT_ALIGNMENTS), 'flexbox'),
  'justify-content': as(
    'justifyContent',
    alignment('justify-content', CONTENT_ALIGNMENTS),
    'flexbox',
  ),
  display: {
    native: ['hidden'],
    parse: (raw) => {
      if (!['none', 'flex'].includes(text(raw))) fail('Only display: none|flex supported');
      return { hidden: text(raw) === 'none' };
    },
    category: 'display',
  },
  hidden: {
    native: ['hidden'],
    parse: (raw) => ({ hidden: raw === true || raw === 'true' }),
    category: 'display',
  },
  'border-radius': extent('borderRadius', 'borderParts'),
  'corner-radius': extent('borderRadius', 'borderParts'),
  border: { native: ['borderWidth', 'borderColor'], parse: border, category: 'border' },
  'border-width': extent('borderWidth', 'borderParts'),
  'border-color': colorProp('borderColor', 'borderParts'),
  'box-shadow': { native: SHADOW, parse: boxShadow, category: 'shadow' },
  'shadow-color': colorProp('shadowColor', 'shadowParts'),
  'shadow-radius': extent('shadowRadius', 'shadowParts'),
  'shadow-offset-x': lengthProp('shadowOffsetX', 'shadowParts'),
  'shadow-offset-y': lengthProp('shadowOffsetY', 'shadowParts'),
  'font-size': extent('fontSize', 'textLength'),
  'font-weight': { native: ['fontWeight'], parse: fontWeight, category: 'fontWeight' },
  'font-family': {
    native: ['fontFamily'],
    parse: (raw) => ({ fontFamily: text(raw) }),
    category: 'font',
  },
  'font-style': as('fontStyle', oneOf('font-style', ['normal', 'italic']), 'font'),
  'line-height': { native: ['lineHeight'], parse: lineHeight, category: 'lineHeight' },
  'letter-spacing': lengthProp('letterSpacing', 'textLength'),
  'text-align': as(
    'textAlign',
    oneOf('text-align', ['left', 'center', 'right'], { start: 'left', end: 'right' }),
    'textKeywords',
  ),
  'text-transform': as(
    'textTransform',
    oneOf('text-transform', ['none', 'uppercase', 'lowercase', 'capitalize']),
    'textKeywords',
  ),
  '-webkit-line-clamp': { native: ['lineClamp'], parse: lines, category: 'lineClamp' },
  'number-of-lines': { native: ['lineClamp'], parse: lines, category: 'lineClamp' },
  transform: { native: TRANSFORM, parse: transform, category: 'transform' },
  'translate-x': lengthProp('translateX', 'transformParts'),
  'translate-y': lengthProp('translateY', 'transformParts'),
  scale: as('scale', unitless, 'transformParts'),
  'scale-x': as('scaleX', unitless, 'transformParts'),
  'scale-y': as('scaleY', unitless, 'transformParts'),
  rotate: as('rotate', angle, 'transformParts'),
  transition: { native: ['transition'], parse: transition, category: 'transition' },
} satisfies Record<string, StyleProperty>;

/** Every CSS property, by its kebab-case name. */
export const STYLE_PROPERTIES: Readonly<Record<string, StyleProperty>> = PROPERTIES;

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());

const isProperty = (key: string): key is keyof typeof PROPERTIES => Object.hasOwn(PROPERTIES, key);

export function isStyleProperty(name: string) {
  return isProperty(kebab(name));
}

/** The native props a style property may write. */
export function styleNatives(name: string): readonly NativePropName[] {
  const key = kebab(name);

  return isProperty(key) ? PROPERTIES[key].native : [];
}

/**
 * Parse one declaration (`padding: 20px 24px` or `paddingTop: 4`) into native
 * props. Accepts CSS kebab-case or camelCase names; throws StyleValueError.
 */
export function expandStyle(
  name: string,
  raw: StyleInput,
  context: StyleContext = {},
): NativeProps {
  const key = kebab(name);

  if (!isProperty(key)) fail(`Unsupported native property "${name}"`);

  const { native, parse } = PROPERTIES[key];
  const props = parse(raw, context);

  for (const prop of Object.keys(props))
    if (!native.some((listed) => listed === prop))
      throw new Error(`src/style/properties.ts: ${key} wrote ${prop}, which its native list lacks`);

  return props;
}
