# Store small secrets

Use secureStore for tokens or other small string secrets. Use storage or db for general app data; use persisted with secure enabled for a reactive secret.

## Write, read and protect a secret

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

## Behavior and limits

`get` returns a string or null. Use the same keychainService when reading a value written to a non-default service. Keys and service names accept letters, digits, dots, hyphens and underscores. Authentication can be cancelled or unavailable, and enrollment changes can make a secret unreadable. Declare biometrics when using Face ID. iOS Keychain values can survive uninstall; Android values do not survive loss of the Keystore key. Design sign-out and first-install behavior explicitly.

## Continue

Read [Storage](storage.md) for the related workflow. The API reference lists every method, option, event and return type.
