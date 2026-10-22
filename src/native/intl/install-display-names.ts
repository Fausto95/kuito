// Imported before any module that names Intl.DisplayNames (src/dev/intl-formats.ts).
import IntlFormats from '../../../native/modules/intl/intl';
import { displayNames } from './native-formats';
import { addToIntl } from './polyfill';

addToIntl(Intl, 'DisplayNames', displayNames(IntlFormats.displayName));
