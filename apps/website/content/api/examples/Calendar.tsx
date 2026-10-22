// Format a clock using the device's calendar preferences.
import { localization, type Calendar } from 'kuito';

export function clockLabel(date: Date): string {
  const calendar: Calendar | undefined = localization.calendars.value[0];
  return new Intl.DateTimeFormat(localization.locales.value[0]?.languageTag, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: calendar?.timeZone ?? undefined,
    hour12: calendar?.uses24hourClock == null ? undefined : !calendar.uses24hourClock,
  }).format(date);
}
