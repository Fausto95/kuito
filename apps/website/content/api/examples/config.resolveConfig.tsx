// Validate a configuration in an app-development tool.
import { resolveConfig, SETTING_DEFAULTS, IOS_BACKGROUND_MODES } from 'kuito/config';

const config = resolveConfig(
  {
    name: 'Notes',
    ios: { bundleIdentifier: 'com.example.notes' },
    android: { applicationId: 'com.example.notes' },
    environments: { staging: { idSuffix: '.staging' } },
  },
  '/project/kuito.config.ts',
  'staging',
);
console.log(config.ios.bundleIdentifier, config.splash, config.icon);
console.log(SETTING_DEFAULTS.minSdk, IOS_BACKGROUND_MODES);
