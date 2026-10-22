import { resolveConfig } from '../../src/cli/kuito-config.ts';

/** An app that sets only what every kuito.config.ts must: everything else is a default. */
export const APP_CONFIG = resolveConfig(
  {
    name: 'Kuito',
    ios: { bundleIdentifier: 'dev.kuito.shell' },
    android: { applicationId: 'dev.kuito.shell' },
  },
  'kuito.config.ts',
  'production',
);
