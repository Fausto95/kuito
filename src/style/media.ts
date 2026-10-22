/**
 * `@media` queries as the kernel reads them: each feature a field of one
 * object, all of which must hold. Only what a native app's system state
 * answers is a feature: the window's width, the color scheme and the motion
 * preference. Nothing here knows CSS blocks or stylesheets.
 */
import { StyleValueError } from './properties.ts';

/** The window's width class, by its width in points (pt/dp), as Material's window size classes. */
export type WidthClass = 'compact' | 'medium' | 'expanded';

export interface Media {
  colorScheme?: 'light' | 'dark';
  minWidth?: number;
  maxWidth?: number;
  widthClass?: WidthClass;
  reduceMotion?: boolean;
}

function fail(message: string): never {
  throw new StyleValueError(message);
}

function points(value: string, feature: string): number {
  const match = /^(-?\d*\.?\d+)(px|dp)?$/.exec(value);

  if (!match || (!match[2] && Number(match[1]) !== 0))
    fail(feature + ' takes a length in px, got "' + value + '"');

  return Number(match[1]);
}

/** What each value of a keyword feature means. */
function keyword<T>(feature: string, values: Record<string, T>, expected: string) {
  return (value: string): T => {
    if (!Object.hasOwn(values, value))
      fail(feature + ' takes ' + expected + ', got "' + value + '"');

    return values[value];
  };
}

type Feature = {
  [K in keyof Media]-?: { field: K; read: (value: string) => Media[K] };
}[keyof Media];

const FEATURES: Record<string, Feature> = {
  'min-width': { field: 'minWidth', read: (value) => points(value, 'min-width') },
  'max-width': { field: 'maxWidth', read: (value) => points(value, 'max-width') },
  'width-class': {
    field: 'widthClass',
    read: keyword<WidthClass>(
      'width-class',
      { compact: 'compact', medium: 'medium', expanded: 'expanded' },
      'compact, medium or expanded',
    ),
  },
  'prefers-color-scheme': {
    field: 'colorScheme',
    read: keyword<'light' | 'dark'>(
      'prefers-color-scheme',
      { light: 'light', dark: 'dark' },
      'light or dark',
    ),
  },
  'prefers-reduced-motion': {
    field: 'reduceMotion',
    read: keyword(
      'prefers-reduced-motion',
      { reduce: true, 'no-preference': false },
      'reduce or no-preference',
    ),
  },
};

/** `(min-width: 600px) and (prefers-color-scheme: dark)`, as a `Media`. */
export function parseMedia(query: string): Media {
  const text = query.trim();

  if (!text.startsWith('('))
    fail(
      '@media takes features in parentheses, like (min-width: 600px); got "' +
        text +
        '". Media types and not are not supported.',
    );

  const media: Media = {};
  const parts = text.split(/\)\s*and\s*\(/);

  if (
    !text.endsWith(')') ||
    parts.some((part) => /[(),]|\bor\b/.test(part.replace(/^\(|\)$/g, '')))
  )
    fail(
      '@media takes features joined by and, like (min-width: 600px) and (prefers-color-scheme: dark)',
    );

  for (const part of parts) {
    const feature = part.replace(/^\(|\)$/g, '');
    const colon = feature.indexOf(':');
    const name = (colon === -1 ? feature : feature.slice(0, colon)).trim();
    const value = colon === -1 ? '' : feature.slice(colon + 1).trim();

    if (!Object.hasOwn(FEATURES, name))
      fail(
        'Unsupported media feature ' + name + '. Use one of: ' + Object.keys(FEATURES).join(', '),
      );

    if (!value) fail(name + ' takes a value, like (' + name + ': …)');

    const { field, read } = FEATURES[name];

    if (field in media) fail('@media names ' + name + ' twice');

    Object.assign(media, { [field]: read(value) });
  }

  return media;
}
