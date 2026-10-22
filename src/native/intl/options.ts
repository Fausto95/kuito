// ECMA-402's argument handling, shared by the formats Kuito adds to Intl.

export type Locales = string | readonly string[] | undefined;

/** The requested locales in canonical form; a malformed tag throws a RangeError. */
export function requestedLocales(locales: Locales): string[] {
  return Intl.getCanonicalLocales(
    locales === undefined ? [] : typeof locales === 'string' ? [locales] : [...locales],
  );
}

/** The runtime's own locale, which Hermes' NumberFormat resolves to. */
export function defaultLocale(): string {
  return new Intl.NumberFormat().resolvedOptions().locale;
}

/** The first requested locale, else the runtime's. */
export function firstLocale(locales: Locales): string {
  return requestedLocales(locales)[0] ?? defaultLocale();
}

/** `tag` and its shorter forms, most specific first: `zh-Hant-TW`, `zh-Hant`, `zh`. */
export function fallbacks(tag: string): string[] {
  const parts = tag.split('-');

  return parts.map((_, index) => parts.slice(0, parts.length - index).join('-'));
}

/** The options bag, which must be an object when given. */
export function optionsOf(options: unknown, what: string): Record<string, unknown> {
  if (options === undefined) return {};

  if (typeof options !== 'object' || options === null)
    throw new TypeError(`${what}: options must be an object`);

  return { ...options };
}

/** ECMA-402's GetOption for a string: `fallback` when absent, else one of `values`. */
export function stringOption<const T extends string>(
  options: Record<string, unknown>,
  name: string,
  values: readonly T[],
  fallback: T,
  what: string,
): T {
  const value = options[name];

  if (value === undefined) return fallback;

  // ECMA-402's ToString, for the values an option can match.
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const found = values.find((each) => each === text);

  if (found === undefined)
    throw new RangeError(`${what}: ${name} must be ${values.join(', ')}, got "${text}"`);

  return found;
}

/** ECMA-402's GetNumberOption: an integer from `min` to `max`. */
export function digitsOption(
  options: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
  fallback: number,
  what: string,
): number {
  const value = options[name];

  if (value === undefined) return fallback;

  const number = Number(value);

  if (!Number.isFinite(number) || number < min || number > max)
    throw new RangeError(
      `${what}: ${name} must be from ${min} to ${max}, got ${JSON.stringify(value)}`,
    );

  return Math.floor(number);
}
