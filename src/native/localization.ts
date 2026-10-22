import Localization, {
  type CalendarInfo,
  type LocaleInfo,
} from '../../native/modules/localization/localization';
import {
  translator,
  type MessageCatalogs,
  type MessageKey,
  type MessageValues,
} from './intl/messages';

export type { MessageCatalogs, MessageValues } from './intl/messages';

/** One of the user's preferred languages, most preferred first. */
export type Locale = LocaleInfo;

export type Calendar = CalendarInfo;

/** The user's languages, most preferred first; follows the system's settings while watched. */
export const locales = Localization.locales;

/** The user's calendars, time zone and clock; follows the system's settings while watched. */
export const calendars = Localization.calendars;

/**
 * Messages in ICU MessageFormat, by key, in catalogs by language tag: the
 * returned function formats a key in the catalog of the user's best
 * language, which it reads at each call, so a component follows a change of
 * language. A key that catalog lacks comes from the first catalog.
 */
export function messages<const C extends MessageCatalogs>(
  catalogs: C,
): (key: MessageKey<C>, values?: MessageValues) => string {
  return translator(catalogs, () => locales.value.map((locale) => locale.languageTag));
}
