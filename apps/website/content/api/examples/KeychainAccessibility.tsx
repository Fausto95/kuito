// Keep a token available to background work after the first unlock.
import { secureStore, type KeychainAccessibility } from 'kuito';

export async function saveSession(token: string) {
  const accessibility: KeychainAccessibility = 'afterFirstUnlock';
  await secureStore.set('session-token', token, { keychainAccessible: accessibility });
}
// The accessibility setting applies to the iOS Keychain.
