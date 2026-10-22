import { defineModule, live } from '../../../src/native/define-module';

export type TextDirection = 'ltr' | 'rtl';
export type MeasurementSystem = 'metric' | 'us' | 'uk';
export type TemperatureUnit = 'celsius' | 'fahrenheit';

/** One of the user's preferred languages, most preferred first. */
export type LocaleInfo = {
  /** BCP 47, as `pt-PT` or `zh-Hant-TW`. */
  languageTag: string;
  languageCode: string | null;
  languageScriptCode: string | null;
  regionCode: string | null;
  textDirection: TextDirection | null;
  decimalSeparator: string | null;
  digitGroupingSeparator: string | null;
  measurementSystem: MeasurementSystem | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  temperatureUnit: TemperatureUnit | null;
};

export type CalendarInfo = {
  /** The CLDR identifier, as `gregory`, `buddhist` or `japanese`. */
  calendar: string | null;
  /** IANA, as `Europe/Lisbon`. */
  timeZone: string | null;
  uses24hourClock: boolean | null;
  /** 1 is Sunday, 7 is Saturday. */
  firstWeekday: number | null;
};

// The user's languages, region, time zone and clock (docs/localization.md),
// read on the JS thread and followed while watched.
export default defineModule('Localization', {
  locales: live<LocaleInfo[]>(),
  calendars: live<CalendarInfo[]>(),
  ios: { class: 'KuitoLocalizationModule' },
  android: { class: 'dev.kuito.runtime.modules.localization.KuitoLocalizationModule' },
});
