// The schema of each structured prop (`type: 'json'` in manifest.ts): what
// C++ checks its value against once, as the batch is decoded, and lays out
// for the renderers' generated value types (docs/native-scheduling.md#structured-props).

/**
 * A value's shape. Scalars: `number`, `integer` (a whole number), `string`,
 * `boolean`, `color` (a hex color, read as 0xRRGGBBAA). `enum` names its
 * strings; `list`, `map` (string keys) and `struct` (named fields) nest; a
 * `oneOf` takes the first variant whose `when` matches.
 */
export type Schema =
  | 'number'
  | 'integer'
  | 'string'
  | 'boolean'
  | 'color'
  | { readonly enum: string; readonly values: readonly string[] }
  | { readonly list: Schema }
  | { readonly map: Schema }
  | StructSchema
  | { readonly oneOf: string; readonly variants: readonly Variant[] };

export interface StructSchema {
  /** The generated type's name: `Kuito<struct>Value` in Swift and Kotlin. */
  readonly struct: string;
  readonly fields: Readonly<Record<string, Field>>;
}

/** A struct's field; `optional` ones may be left out, or null. */
export type Field = Schema | { readonly optional: Schema };

/**
 * What tells a variant apart: the value's JSON type, a field it has, or a
 * field's text.
 */
export type When =
  | 'string'
  | 'number'
  | 'boolean'
  | 'list'
  | 'struct'
  | { readonly has: string }
  | { readonly field: string; readonly is: string };

export interface Variant {
  /** The case's name in the generated types. */
  readonly name: string;
  readonly when: When;
  readonly schema: Schema;
}

const optional = (schema: Schema) => ({ optional: schema }) as const;

export const LAYOUT_ANIMATION: Schema = {
  oneOf: 'LayoutAnimation',
  variants: [
    {
      name: 'timing',
      when: { field: 'type', is: 'timing' },
      schema: {
        struct: 'TimingAnimation',
        fields: { type: 'string', duration: 'number', easing: { list: 'number' }, delay: 'number' },
      },
    },
    {
      name: 'spring',
      when: { field: 'type', is: 'spring' },
      schema: {
        struct: 'SpringAnimation',
        fields: {
          type: 'string',
          damping: 'number',
          stiffness: 'number',
          mass: 'number',
          delay: 'number',
        },
      },
    },
  ],
};

export const GRADIENT: Schema = {
  struct: 'Gradient',
  fields: { angle: 'number', colors: { list: 'color' } },
};

export const IMAGE_SOURCE: Schema = {
  oneOf: 'ImageSource',
  variants: [
    { name: 'url', when: 'string', schema: 'string' },
    {
      name: 'bundled',
      when: { has: 'asset' },
      schema: {
        struct: 'BundledImage',
        fields: { asset: 'string', width: 'number', height: 'number' },
      },
    },
    {
      name: 'remote',
      when: { has: 'uri' },
      schema: {
        struct: 'RemoteImage',
        fields: { uri: 'string', headers: optional({ map: 'string' }) },
      },
    },
  ],
};

export const SYMBOL_NAME: Schema = {
  oneOf: 'SymbolName',
  variants: [
    { name: 'name', when: 'string', schema: 'string' },
    {
      name: 'platforms',
      when: 'struct',
      schema: { struct: 'SymbolNames', fields: { ios: 'string', android: 'string' } },
    },
  ],
};

export const KEYS: Schema = { list: 'string' };

export const SCROLL_REQUEST: Schema = {
  oneOf: 'ScrollRequest',
  variants: [
    {
      name: 'key',
      when: { has: 'key' },
      schema: {
        struct: 'ScrollToKey',
        fields: {
          key: 'string',
          animated: optional('boolean'),
          align: optional('number'),
          margin: optional('number'),
          request: 'integer',
        },
      },
    },
    {
      name: 'end',
      when: { has: 'end' },
      schema: {
        struct: 'ScrollToEnd',
        fields: { end: 'boolean', animated: optional('boolean'), request: 'integer' },
      },
    },
    {
      name: 'offset',
      when: { has: 'offset' },
      schema: {
        struct: 'ScrollToOffset',
        fields: { offset: 'number', animated: optional('boolean'), request: 'integer' },
      },
    },
    {
      // A whole view length each, as paging rests: a Scroll's, not a list's.
      name: 'page',
      when: { has: 'page' },
      schema: {
        struct: 'ScrollToPage',
        fields: { page: 'integer', animated: optional('boolean'), request: 'integer' },
      },
    },
  ],
};

export const EDGES: Schema = {
  list: { enum: 'Edge', values: ['top', 'right', 'bottom', 'left'] },
};

export const SNAP_POINTS: Schema = {
  list: {
    oneOf: 'SnapPoint',
    variants: [
      { name: 'height', when: 'number', schema: 'number' },
      // 'content', or a percentage of the screen: `'50%'`.
      { name: 'named', when: 'string', schema: 'string' },
    ],
  },
};

/** A symbol by platform, as an icon may name one for each. */
const PLATFORM_SYMBOLS: Schema = {
  struct: 'PlatformSymbols',
  fields: { ios: optional('string'), android: optional('string') },
};

export const TAB_ICON: Schema = {
  oneOf: 'TabIcon',
  variants: [
    { name: 'symbol', when: 'string', schema: 'string' },
    {
      name: 'image',
      when: { has: 'uri' },
      schema: { struct: 'TabImage', fields: { uri: 'string' } },
    },
    { name: 'platforms', when: 'struct', schema: PLATFORM_SYMBOLS },
  ],
};

/** A screen header's buttons (docs/navigation.md#headers), in order: a press reports its index. */
export const HEADER_ITEMS: Schema = {
  list: {
    struct: 'HeaderItem',
    fields: {
      label: 'string',
      icon: optional({
        oneOf: 'HeaderIcon',
        variants: [
          { name: 'symbol', when: 'string', schema: 'string' },
          { name: 'platforms', when: 'struct', schema: PLATFORM_SYMBOLS },
        ],
      }),
      disabled: optional('boolean'),
      placement: { enum: 'HeaderPlacement', values: ['leading', 'trailing'] },
    },
  },
};

export const HEADER_SEARCH: Schema = {
  struct: 'HeaderSearch',
  fields: { placeholder: optional('string') },
};

export const ACTIONS: Schema = {
  list: {
    struct: 'AccessibilityAction',
    fields: { name: 'string', label: optional('string') },
  },
};

/** A hit area's edges, as React Native Gesture Handler takes them; a number is all four. */
const HIT_SLOP_EDGES: Schema = {
  struct: 'HitSlopEdges',
  fields: Object.fromEntries(
    ['left', 'top', 'right', 'bottom', 'width', 'height', 'horizontal', 'vertical'].map((edge) => [
      edge,
      optional('number'),
    ]),
  ),
};

/**
 * One gesture's native recognizer (docs/motion.md, "Native contract"). Its
 * `config` holds React Native Gesture Handler's keys, which each platform's
 * handler for the gesture's type reads and checks: here, each is a number,
 * a boolean or a hit area's edges.
 */
export const GESTURES: Schema = {
  list: {
    struct: 'GestureSpec',
    fields: {
      tag: 'integer',
      type: {
        enum: 'GestureType',
        values: ['pan', 'tap', 'longPress', 'pinch', 'rotation', 'fling'],
      },
      config: optional({
        map: {
          oneOf: 'GestureConfigEntry',
          variants: [
            { name: 'number', when: 'number', schema: 'number' },
            { name: 'flag', when: 'boolean', schema: 'boolean' },
            { name: 'edges', when: 'struct', schema: HIT_SLOP_EDGES },
          ],
        },
      }),
      waitFor: optional({ list: 'integer' }),
      simultaneousHandlers: optional({ list: 'integer' }),
      blocksHandlers: optional({ list: 'integer' }),
    },
  },
};

export const LINES: Schema = {
  oneOf: 'Lines',
  variants: [
    { name: 'count', when: 'number', schema: 'integer' },
    {
      name: 'range',
      when: 'struct',
      schema: {
        struct: 'LineRange',
        fields: { min: optional('integer'), max: optional('integer') },
      },
    },
  ],
};

export const SELECTION: Schema = {
  struct: 'Selection',
  fields: { start: 'integer', end: 'integer' },
};

export const OFFSETS: Schema = { list: 'number' };
