// Intl.RelativeTimeFormat, ListFormat and DisplayNames over the platform's
// locale data (native/modules/intl), for Hermes, which has none of them.
// Arguments are checked here as ECMA-402 checks them; the platform formats.
import type {
  DisplayNameStyle,
  DisplayNameType,
  LanguageDisplay,
  ListStyle,
  ListType,
  RelativeTimeNumeric,
  RelativeTimeStyle,
  RelativeTimeUnit,
} from '../../../native/modules/intl/intl';
import { firstLocale, optionsOf, requestedLocales, stringOption, type Locales } from './options';

/** The module's functions, as the formats call them. */
export interface IntlNative {
  relativeTime(
    locale: string,
    style: RelativeTimeStyle,
    numeric: RelativeTimeNumeric,
    value: number,
    unit: RelativeTimeUnit,
  ): string;
  list(locale: string, type: ListType, style: ListStyle, items: string[]): string;
  displayName(
    locale: string,
    type: DisplayNameType,
    style: DisplayNameStyle,
    languageDisplay: LanguageDisplay,
    code: string,
  ): string | null;
}

const STYLES = ['long', 'short', 'narrow'] as const;
const UNITS: readonly RelativeTimeUnit[] = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
];

/** ECMA-402 takes each unit singular or plural. */
function unitOf(unit: unknown): RelativeTimeUnit {
  const text = String(unit);
  const found = UNITS.find((each) => text === each || text === `${each}s`);

  if (!found) throw new RangeError(`Intl.RelativeTimeFormat: "${text}" is not a unit`);

  return found;
}

/** A platform's ERR_UNSUPPORTED as the RangeError an unsupported option is. */
function supported<T>(what: string, call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_UNSUPPORTED')
      throw new RangeError(`${what}: ${error.message}`);

    throw error;
  }
}

/** The well-formed code for `type`, canonicalized, or a RangeError. */
const CODES: Record<DisplayNameType, (code: string) => string | undefined> = {
  // A language id: no extensions (`-u-ca-…`) or private use.
  language: (code) => requestedLocales(code).find((tag) => !/-[a-z0-9]-/i.test(tag)),
  region: (code) => (/^([a-z]{2}|\d{3})$/i.test(code) ? code.toUpperCase() : undefined),
  script: (code) =>
    /^[a-z]{4}$/i.test(code) ? code[0]?.toUpperCase() + code.slice(1).toLowerCase() : undefined,
  currency: (code) => (/^[a-z]{3}$/i.test(code) ? code.toUpperCase() : undefined),
  calendar: (code) =>
    /^[a-z0-9]{3,8}(-[a-z0-9]{3,8})*$/i.test(code) ? code.toLowerCase() : undefined,
};

/** Intl.RelativeTimeFormat over the platform's `relativeTime`. */
export function relativeTimeFormat(relativeTime: IntlNative['relativeTime']) {
  return class RelativeTimeFormat {
    static supportedLocalesOf(locales: Locales): string[] {
      return requestedLocales(locales);
    }

    private readonly locale: string;
    private readonly style: RelativeTimeStyle;
    private readonly numeric: RelativeTimeNumeric;

    constructor(locales?: Locales, options?: Intl.RelativeTimeFormatOptions) {
      const what = 'Intl.RelativeTimeFormat';
      const bag = optionsOf(options, what);

      this.locale = firstLocale(locales);
      this.style = stringOption(bag, 'style', STYLES, 'long', what);
      this.numeric = stringOption(bag, 'numeric', ['always', 'auto'], 'always', what);
    }

    format(value: number, unit: Intl.RelativeTimeFormatUnit): string {
      const number = Number(value);

      if (!Number.isFinite(number))
        throw new RangeError(`Intl.RelativeTimeFormat: ${String(value)} is not a finite number`);

      return relativeTime(this.locale, this.style, this.numeric, number, unitOf(unit));
    }

    resolvedOptions(): Intl.ResolvedRelativeTimeFormatOptions {
      return {
        locale: this.locale,
        style: this.style,
        numeric: this.numeric,
        numberingSystem: 'latn',
      };
    }
  };
}

/** Intl.ListFormat over the platform's `list`. */
export function listFormat(formatList: IntlNative['list']) {
  return class ListFormat {
    static supportedLocalesOf(locales: Locales): string[] {
      return requestedLocales(locales);
    }

    private readonly locale: string;
    private readonly type: ListType;
    private readonly style: ListStyle;

    constructor(locales?: Locales, options?: Intl.ListFormatOptions) {
      const what = 'Intl.ListFormat';
      const bag = optionsOf(options, what);
      const locale = firstLocale(locales);
      const type = stringOption(
        bag,
        'type',
        ['conjunction', 'disjunction', 'unit'],
        'conjunction',
        what,
      );
      const style = stringOption(bag, 'style', STYLES, 'long', what);

      // The platform says now whether it has the type, as an option would fail.
      supported(what, () => formatList(locale, type, style, []));
      this.locale = locale;
      this.type = type;
      this.style = style;
    }

    format(list: Iterable<string> = []): string {
      const items = [...list];

      if (!items.every((item) => typeof item === 'string'))
        throw new TypeError('Intl.ListFormat: every item of the list must be a string');

      return formatList(this.locale, this.type, this.style, items);
    }

    resolvedOptions(): Intl.ResolvedListFormatOptions {
      return { locale: this.locale, type: this.type, style: this.style };
    }
  };
}

/** Intl.DisplayNames over the platform's `displayName`. */
export function displayNames(displayName: IntlNative['displayName']) {
  return class DisplayNames {
    static supportedLocalesOf(locales: Locales): string[] {
      return requestedLocales(locales);
    }

    private readonly locale: string;
    private readonly type: DisplayNameType;
    private readonly style: DisplayNameStyle;
    private readonly fallback: 'code' | 'none';
    private readonly languageDisplay: LanguageDisplay;

    constructor(locales: Locales, options: Intl.DisplayNamesOptions) {
      const what = 'Intl.DisplayNames';
      const bag = optionsOf(options, what);

      if (bag.type === undefined) throw new TypeError(`${what}: options.type is required`);

      if (bag.type === 'dateTimeField')
        throw new RangeError(`${what}: neither platform names date and time fields`);

      this.locale = firstLocale(locales);
      this.style = stringOption(bag, 'style', STYLES, 'long', what);

      this.type = stringOption(
        bag,
        'type',
        ['language', 'region', 'script', 'currency', 'calendar'],
        'language',
        what,
      );

      this.fallback = stringOption(bag, 'fallback', ['code', 'none'], 'code', what);

      this.languageDisplay = stringOption(
        bag,
        'languageDisplay',
        ['dialect', 'standard'],
        'dialect',
        what,
      );
    }

    of(code: string): string | undefined {
      const canonical = CODES[this.type](String(code));

      if (canonical === undefined)
        throw new RangeError(`Intl.DisplayNames: "${String(code)}" is not a ${this.type} code`);

      const name = displayName(this.locale, this.type, this.style, this.languageDisplay, canonical);

      return name ?? (this.fallback === 'code' ? canonical : undefined);
    }

    resolvedOptions(): Intl.ResolvedDisplayNamesOptions {
      return {
        locale: this.locale,
        style: this.style,
        type: this.type,
        fallback: this.fallback,
        ...(this.type === 'language' ? { languageDisplay: this.languageDisplay } : {}),
      };
    }
  };
}

/** The three formats over the platform's locale data. */
export function nativeFormats(native: IntlNative) {
  return {
    RelativeTimeFormat: relativeTimeFormat((...args) => native.relativeTime(...args)),
    ListFormat: listFormat((...args) => native.list(...args)),
    DisplayNames: displayNames((...args) => native.displayName(...args)),
  };
}
