// Installed by the `kuito` entry, before the app runs. PluralRules is
// JavaScript of its own; the formats over the platform's locale data install
// before the first module that names one (src/dev/intl-formats.ts), so an app
// that uses none calls no native module for them.
import { PluralRules } from './plural-rules';
import { addToIntl } from './polyfill';

addToIntl(Intl, 'PluralRules', PluralRules);
