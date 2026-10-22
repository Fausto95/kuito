import { defineModule, fn } from '../../../src/native/define-module';

/** When a secret can be read (docs/secure-store.md). */
export type KeychainAccessibility =
  | 'whenUnlocked'
  | 'afterFirstUnlock'
  | 'whenUnlockedThisDeviceOnly'
  | 'afterFirstUnlockThisDeviceOnly'
  | 'whenPasscodeSetThisDeviceOnly';

/** One call's secret and options, as src/native/secure-store.ts fills them in. */
export type SecureStoreRequest = {
  /** Never contains ":", nor does `service`, so `service:key` entries don't collide. */
  key: string;
  /** Only for `setItem`. */
  value?: string;
  service: string;
  accessible: KeychainAccessibility;
  requireAuthentication: boolean;
  prompt: string | null;
};

// Secrets in the iOS Keychain, and on Android encrypted with an Android
// Keystore key (docs/secure-store.md). On the background thread: a read that
// needs biometrics waits for the user's answer.
export default defineModule('SecureStore', {
  getItem: fn.background.callback<(request: SecureStoreRequest) => Promise<string | null>>(),
  setItem: fn.background.callback<(request: SecureStoreRequest) => Promise<void>>(),
  deleteItem: fn.background<(request: SecureStoreRequest) => Promise<void>>(),
  ios: { class: 'KuitoSecureStoreModule' },
  android: { class: 'dev.kuito.runtime.modules.securestore.KuitoSecureStoreModule' },
});
