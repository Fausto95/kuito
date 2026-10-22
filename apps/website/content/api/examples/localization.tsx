import { localization } from 'kuito';

const [locale] = localization.locales.value;
const [calendar] = localization.calendars.value;

locale?.languageTag; // 'pt-PT'
calendar?.timeZone; // 'Europe/Lisbon'
