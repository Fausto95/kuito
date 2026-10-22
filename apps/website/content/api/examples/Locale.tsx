// Choose distance units from the user's preferred locale.
import { localization, type Locale } from 'kuito';

export function distanceLabel(meters: number) {
  const locale: Locale | undefined = localization.locales.value[0];
  return locale?.measurementSystem === 'us'
    ? `${(meters / 1609.344).toFixed(1)} mi`
    : `${(meters / 1000).toFixed(1)} km`;
}
