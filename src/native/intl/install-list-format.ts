// Imported before any module that names Intl.ListFormat (src/dev/intl-formats.ts).
import IntlFormats from '../../../native/modules/intl/intl';
import { listFormat } from './native-formats';
import { addToIntl } from './polyfill';

addToIntl(Intl, 'ListFormat', listFormat(IntlFormats.list));
