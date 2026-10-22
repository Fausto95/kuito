import type { KuitoConfig } from 'kuito/config';

// This checkout's own app: Reel, the showcase `kuito dev` runs by default
// (docs/showcase.md). The other demos run in the same shell through --entry,
// so it declares every permission any of them asks for.
export default {
  name: 'Reel',
  version: '1.0.0',
  buildNumber: 1,
  icon: './reel/assets/icon.png',
  // The scheme docs/linking.md's examples open.
  urlSchemes: ['kuito'],
  ios: { bundleIdentifier: 'dev.kuito.shell' },
  android: { applicationId: 'dev.kuito.shell' },
  permissions: {
    camera: 'Kuito demos use the camera.',
    microphone: 'Kuito demos use the microphone.',
    photos: 'Kuito demos use your photo library.',
    location: 'Kuito demos use your location while you use them.',
    locationAlways: 'Kuito demos track your location in the background.',
    biometrics: 'Kuito demos unlock secrets with Face ID.',
    notifications: true,
  },
  // storage.tsx's launch log (docs/storage.md#migrations), and recipes/offline-notes.tsx's notes.
  migrations: [
    'CREATE TABLE launches (id INTEGER PRIMARY KEY, at TEXT NOT NULL)',
    'CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT NOT NULL, updatedAt INTEGER NOT NULL, synced INTEGER NOT NULL)',
  ],
  // recipes/reminders.tsx's top-up (docs/background-tasks.md).
  backgroundTasks: ['reminders.top-up'],
  environments: {
    staging: {
      name: 'Reel Staging',
      idSuffix: '.staging',
      icon: './reel/assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
