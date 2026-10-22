import SecureStore, {
  type KeychainAccessibility as Accessibility,
  type SecureStoreRequest,
} from '../../native/modules/secure-store/secure-store';

/** When a secret can be read (docs/secure-store.md). */
export type KeychainAccessibility = Accessibility;

export type SecureStoreOptions = {
  /** Keeps a separate set of secrets: the iOS Keychain service. Defaults to `'app'`. */
  keychainService?: string;
  /** Defaults to `'whenUnlocked'`. */
  keychainAccessible?: KeychainAccessibility;
  /** Ask for biometrics to read the secret, and on Android to write it. */
  requireAuthentication?: boolean;
  /** What the biometric prompt says. */
  authenticationPrompt?: string;
};

// Keys and services name Keychain items and Android preferences; the same
// rule as expo-secure-store keeps them portable between both.
const name = /^[\w.-]+$/;

function request(key: string, options: SecureStoreOptions): SecureStoreRequest {
  const { keychainService = 'app' } = options;

  if (typeof key !== 'string' || !name.test(key))
    throw new TypeError(
      `secureStore: invalid key "${String(key)}". Keys are non-empty and use only letters, digits, ".", "-" and "_".`,
    );

  if (!name.test(keychainService))
    throw new TypeError(
      `secureStore: invalid keychainService "${keychainService}". Use only letters, digits, ".", "-" and "_".`,
    );

  return {
    key,
    service: keychainService,
    accessible: options.keychainAccessible ?? 'whenUnlocked',
    requireAuthentication: options.requireAuthentication ?? false,
    prompt: options.authenticationPrompt ?? null,
  };
}

/** Rejects instead of throwing, as a function returning a promise should. */
function attempt<T>(run: () => Promise<T>): Promise<T> {
  try {
    return run();
  } catch (error) {
    return Promise.reject(error);
  }
}

// Secrets in the iOS Keychain, and on Android encrypted with an Android
// Keystore key: `storage`'s verbs over the keychain (docs/secure-store.md).

/** The secret under `key`, or `null`. */
export const get = (key: string, options: SecureStoreOptions = {}): Promise<string | null> =>
  attempt(() => SecureStore.getItem(request(key, options)));

/** Stores `value` under `key`, replacing the secret and its options. */
export const set = (key: string, value: string, options: SecureStoreOptions = {}): Promise<void> =>
  attempt(() => {
    if (typeof value !== 'string')
      throw new TypeError(
        'secureStore.set: the value must be a string; store JSON.stringify(value) for data.',
      );

    return SecureStore.setItem({ ...request(key, options), value });
  });

const remove = (key: string, options: SecureStoreOptions = {}): Promise<void> =>
  attempt(() => SecureStore.deleteItem(request(key, options)));

export { remove as delete };
