import type { KuitoConfig } from 'kuito/config';

// The native settings of the shells kuito generates into .kuito/ (docs/apps.md in Kuito).
// This is the production app; `kuito dev --env staging` builds the staging one.
export default {
  name: '{{name}}',
  // What users see, and the number stores order uploads by: raise it for every upload.
  version: '1.0.0',
  buildNumber: 1,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: '{{id}}' },
  android: { applicationId: '{{id}}' },
  // What the app asks for, with the reason iOS shows, e.g. camera: 'Scan tickets.'
  // (docs/permissions.md in Kuito).
  permissions: {},
  // The launch screen, up until the first screen is (docs/splash.md in Kuito).
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    dark: { background: '#21164A' },
  },
  environments: {
    staging: {
      name: '{{name}} Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
      splash: { background: '#FF8115', dark: { background: '#4A2205' } },
    },
  },
} satisfies KuitoConfig;
