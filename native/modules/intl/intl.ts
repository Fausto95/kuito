import { defineModule, fn } from '../../../src/native/define-module';

export type RelativeTimeStyle = 'long' | 'short' | 'narrow';

export type RelativeTimeNumeric = 'always' | 'auto';

export type RelativeTimeUnit =
  | 'year'
  | 'quarter'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

export type ListType = 'conjunction' | 'disjunction' | 'unit';

export type ListStyle = 'long' | 'short' | 'narrow';

export type DisplayNameType = 'language' | 'region' | 'script' | 'currency' | 'calendar';

export type DisplayNameStyle = 'long' | 'short' | 'narrow';

export type LanguageDisplay = 'dialect' | 'standard';

// The platform's locale data behind the Intl formats Hermes lacks
// (src/native/intl, docs/web-apis.md#intl): Foundation's formatters on iOS,
// android.icu on Android. Each call gets a canonical BCP 47 tag and options
// already checked; a combination the platform cannot format throws
// ERR_UNSUPPORTED, which the format turns into a RangeError.
export default defineModule('IntlFormats', {
  relativeTime:
    fn.sync<
      (
        locale: string,
        style: RelativeTimeStyle,
        numeric: RelativeTimeNumeric,
        value: number,
        unit: RelativeTimeUnit,
      ) => string
    >(),
  list: fn.sync<(locale: string, type: ListType, style: ListStyle, items: string[]) => string>(),
  /** Null when the platform has no name for the code. */
  displayName:
    fn.sync<
      (
        locale: string,
        type: DisplayNameType,
        style: DisplayNameStyle,
        languageDisplay: LanguageDisplay,
        code: string,
      ) => string | null
    >(),
  ios: { class: 'KuitoIntlFormatsModule' },
  android: { class: 'dev.kuito.runtime.modules.intl.KuitoIntlFormatsModule' },
});
