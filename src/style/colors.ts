// CSS colors as both renderers parse them: hex, alpha last (#rrggbbaa).
// UIKit (UIColor(kuitoHex:)) and Android (cssColor) read nothing else, so
// every notation compiles to hex here.

export class ColorError extends Error {}

function fail(message: string): never {
  throw new ColorError(message);
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const byte = (unit: number) =>
  Math.round(unit * 255)
    .toString(16)
    .padStart(2, '0');

function hex(red: number, green: number, blue: number, alpha: number) {
  return '#' + byte(red) + byte(green) + byte(blue) + (alpha < 1 ? byte(alpha) : '');
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** A number, or a percentage of `full`; `name` says which function, for errors. */
function channel(token: string, full: number, name: string) {
  const percent = token.endsWith('%');
  const text = percent ? token.slice(0, -1) : token;

  if (!NUMBER.test(text)) fail(`${name}() takes numbers, got "${token}"`);

  return percent ? (Number(text) / 100) * full : Number(text);
}

function within(value: number, max: number, message: string) {
  if (!(value >= 0 && value <= max)) fail(message);

  return value;
}

/** `r g b / a` or the legacy `r, g, b, a`: the channels and the optional alpha. */
function channels(args: string, name: string) {
  const [colors, alpha, ...rest] = args.split('/').map((part) => part.trim());
  const parts = colors.includes(',')
    ? colors.split(',').map((part) => part.trim())
    : colors.split(/\s+/);
  const legacyAlpha = colors.includes(',') && parts.length === 4 ? parts.pop() : undefined;

  if (rest.length || (alpha !== undefined && legacyAlpha !== undefined))
    fail(`${name}() takes one alpha`);

  const opacity = alpha ?? legacyAlpha;

  return {
    parts,
    alpha:
      opacity === undefined
        ? 1
        : within(channel(opacity, 1, name), 1, `${name}() alpha must be between 0 and 1`),
  };
}

function rgb(args: string, name: string) {
  const { parts, alpha } = channels(args, name);

  if (parts.length !== 3) fail(`${name}() takes three channels`);

  const [red, green, blue] = parts.map(
    (part) =>
      within(channel(part, 255, name), 255, `${name}() channels must be between 0 and 255`) / 255,
  );

  return hex(red, green, blue, alpha);
}

function hsl(args: string, name: string) {
  const { parts, alpha } = channels(args, name);

  if (parts.length !== 3) fail(`${name}() takes a hue, a saturation and a lightness`);

  const hue = channel(parts[0].replace(/deg$/, ''), 360, name);
  const [saturation, lightness] = parts.slice(1).map((part) => {
    if (!part.endsWith('%')) fail(`${name}() saturation and lightness are percentages`);

    return within(channel(part, 1, name), 1, `${name}() percentages must be between 0% and 100%`);
  });
  // CSS Color 4's hslToRgb.
  const at = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);

    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };

  return hex(at(0), at(8), at(4), alpha);
}

/** `color(srgb r g b [/ a])`, channels 0–1 or percentages. */
function color(args: string) {
  const [space = '', ...rest] = args.trim().split(/\s+/);

  if (space !== 'srgb') fail(`color() supports the srgb color space, got ${space}`);

  const { parts, alpha } = channels(rest.join(' '), 'color');

  if (parts.length !== 3) fail('color(srgb) takes three channels');

  const [red, green, blue] = parts.map((part) =>
    within(channel(part, 1, 'color'), 1, 'color(srgb) channels must be between 0 and 1'),
  );

  return hex(red, green, blue, alpha);
}

const FUNCTIONS: Partial<Record<string, (args: string, name: string) => string>> = {
  rgb,
  rgba: rgb,
  hsl,
  hsla: hsl,
  color,
};

export const isColorFunction = (name: string) => Object.hasOwn(FUNCTIONS, name.toLowerCase());

/** Whether a token is written as a color: hex, a color function or a word. */
export function looksLikeColor(token: string) {
  return /^(?:#|[a-z-]+\(|[a-z]+$)/i.test(token);
}

/** A CSS color as `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`; throws ColorError. */
export function parseColor(raw: string): string {
  const value = raw.trim();

  if (value.startsWith('#')) {
    if (!HEX.test(value)) fail(`Invalid hex color "${value}"`);

    return value.toLowerCase();
  }

  const fn = /^([a-z-]+)\((.*)\)$/i.exec(value);

  if (fn) {
    const name = fn[1].toLowerCase();
    const parse = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;

    if (!parse) fail(`Unknown color function ${name}()`);

    return parse(fn[2], name);
  }

  const name = value.toLowerCase();

  if (name === 'transparent') return '#00000000';
  if (Object.hasOwn(NAMED_COLORS, name)) return NAMED_COLORS[name];

  return fail(`Unknown color "${value}"`);
}

/** CSS Color 4's named colors. */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};
