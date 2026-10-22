# secureStore

Secrets such as tokens and passwords: `storage`'s verbs over the keychain. iOS keeps them
in the Keychain. Android encrypts them with an Android Keystore key, with no
`androidx.security-crypto` dependency. A secret the UI follows can be a signal:
[`persisted(…, { secure: true })`](storage.md#persisted) keeps its value here.

```tsx
import { secureStore } from 'kuito';

await secureStore.set('token', 's3cret');
await secureStore.get('token'); // 's3cret', or null
await secureStore.delete('token');

await secureStore.set('pin', '1234', {
  keychainService: 'auth',
  keychainAccessible: 'afterFirstUnlock',
  requireAuthentication: true,
  authenticationPrompt: 'Unlock your account',
});
```

Keys and `keychainService` use only letters, digits, `.`, `-` and `_`.
Values are strings; store `JSON.stringify(value)` for data. Anything else
rejects with a `TypeError` before reaching the platform. Keep each secret
small, a few KB at most. The Keychain is not a database.

## Options

| Option                  | Default           | Meaning                                                                 |
| ----------------------- | ----------------- | ----------------------------------------------------------------------- |
| `keychainService`       | `'app'`           | A separate set of secrets: the same key in two services is two secrets. |
| `keychainAccessible`    | `'whenUnlocked'`  | When the secret can be read; see below.                                 |
| `requireAuthentication` | `false`           | Each use needs a biometric.                                             |
| `authenticationPrompt`  | the system's text | What the biometric prompt says.                                         |

`set` replaces the secret along with its options. Reads and
deletes find the secret by key and service alone.

### Accessibility

| Value                              | iOS (`kSecAttrAccessible…`)      | Android                                          |
| ---------------------------------- | -------------------------------- | ------------------------------------------------ |
| `'whenUnlocked'`                   | `WhenUnlocked`                   | key usable only while unlocked (Android 9+)      |
| `'afterFirstUnlock'`               | `AfterFirstUnlock`               | usable once unlocked after boot                  |
| `'whenUnlockedThisDeviceOnly'`     | `WhenUnlockedThisDeviceOnly`     | as `'whenUnlocked'`                              |
| `'afterFirstUnlockThisDeviceOnly'` | `AfterFirstUnlockThisDeviceOnly` | as `'afterFirstUnlock'`                          |
| `'whenPasscodeSetThisDeviceOnly'`  | `WhenPasscodeSetThisDeviceOnly`  | as `'whenUnlocked'`; writing needs a screen lock |

Use `'afterFirstUnlock'` for a secret that background work needs, such as a
token a background fetch sends. Reading a `'whenUnlocked'` secret while the
device is locked rejects with `ERR_UNAVAILABLE`. On Android 8 (API 26–27),
which can't require an unlocked device, `'whenUnlocked'` behaves as
`'afterFirstUnlock'`. Android app data is encrypted until the first unlock
anyway.

On iOS, `'whenPasscodeSetThisDeviceOnly'` fails to write without a
passcode, and the system deletes the secret if the passcode is removed.
Android checks for a screen lock when writing, but a secret stays if the
lock is removed later.

### Authentication

`requireAuthentication: true` binds the secret to the biometrics enrolled
now. Enrolling a new face or fingerprint makes the secret unreadable, and
`get` then resolves `null`.

- **iOS:** the item's access control is `biometryCurrentSet`. Writing never
  prompts; each read shows Face ID or Touch ID with `authenticationPrompt`.
  Declare `biometrics` in [`kuito.config.ts`](permissions.md#declare-them-in-kuitoconfigts),
  with the reason iOS shows for Face ID.
- **Android 11+ (API 30):** a Keystore key that requires a strong biometric
  for every use. Both writing and reading show `BiometricPrompt` with
  `authenticationPrompt` as its title. Android 8–10 rejects
  `requireAuthentication` with `ERR_AUTH_UNAVAILABLE`. The `biometrics`
  declaration adds the `USE_BIOMETRIC` permission that `BiometricPrompt`
  needs.

Without an enrolled biometric, writing rejects with `ERR_AUTH_UNAVAILABLE`.
A dismissed prompt rejects with `ERR_AUTH_CANCELED`, and a failed one with
`ERR_AUTH_FAILED`.

## What each platform guarantees

**iOS.** Each secret is a `kSecClassGenericPassword` item (service, account =
key) in the app's own Keychain access group. Items are not synchronized to
iCloud Keychain. The Secure Enclave–protected Keychain encrypts them, and
other apps can't read them.

**Android.** Each secret is encrypted with AES-256-GCM using one of three
Keystore keys: plain, unlocked-device-required, or biometric-bound. The key
material never leaves the Keystore, which is hardware-backed (TEE or
StrongBox) on devices that have one. The ciphertext, its IV and the key's
alias are stored in the app's private `kuito.securestore` SharedPreferences
file. The entry's name (service and key) is authenticated data, so a
ciphertext moved to another entry fails to decrypt. Writes are committed
synchronously.

## Reinstall and backup

| Event                        | iOS                                                                                           | Android                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Uninstall, then reinstall    | **Secrets survive.** The Keychain outlives the app.                                           | Secrets are gone: the app's data and Keystore keys are deleted.     |
| Backup restored, same device | Restored.                                                                                     | The ciphertext may be restored, but its key is not.                 |
| Backup restored, new device  | Encrypted backups restore non-`THIS_DEVICE_ONLY` secrets. `THIS_DEVICE_ONLY` ones don't move. | Keys never leave the device, so restored ciphertexts can't decrypt. |

On Android, a secret whose key is gone (restored, wiped, or invalidated by a
new biometric) reads as `null`, and its unreadable entry is deleted.

Because iOS secrets survive a reinstall, an app that must start clean should
record its first launch in [`Storage`](storage.md), which a reinstall
clears. When that record is missing, delete the secrets it knows about.
