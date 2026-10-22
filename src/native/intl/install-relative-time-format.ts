// Imported before any module that names Intl.RelativeTimeFormat (src/dev/intl-formats.ts).
import IntlFormats from '../../../native/modules/intl/intl';
import { relativeTimeFormat } from './native-formats';
import { addToIntl } from './polyfill';

addToIntl(Intl, 'RelativeTimeFormat', relativeTimeFormat(IntlFormats.relativeTime));
