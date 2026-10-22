// Validate an Info.plist value supplied to a configuration tool.
import { plistValue, type PlistDictionary } from 'kuito/config';

const settings: PlistDictionary = { UIFileSharingEnabled: true };
const checked = plistValue(settings, 'ios.infoPlist', (key, message) => {
  throw new Error(`${key}: ${message}`);
});
console.log(checked);
