# Sign in

A form that tells the keyboard and the password manager what each field holds, stays above the keyboard, and keeps the session token in the keychain.

**Use it for**

- An email and password that autofill, with submit on the keyboard's go key.
- Rejecting a short password before any request.
- A token that survives a relaunch, and a sign-out that deletes it.

The whole screen is [demo/recipes/sign-in.tsx](../../../../../demo/recipes/sign-in.tsx). Its headless test fakes the keychain and the server.

## Ask for the right keyboard

`type`, `autoComplete` and `enterKeyHint` are hints to the platform. `maxLength` stops the email at 254 characters. `submitBehavior="blurAndSubmit"` dismisses the keyboard and calls `onSubmit`. `keyboard={{ avoid: 'position' }}` lifts the form until the focused field clears the keyboard.

```tsx
import { Button, SafeArea, Text, TextField, VStack, secureStore, signal } from 'kuito';

const TOKEN_KEY = 'session-token';

export default function SignIn() {
  const email = signal('');
  const password = signal('');
  const problem = signal('');

  async function submit() {
    if (!email.value.includes('@')) return void (problem.value = 'Enter your email address.');
    if (password.value.length < 8) return void (problem.value = 'Use at least 8 characters.');

    await secureStore.set(TOKEN_KEY, 'token-from-the-server', {
      keychainAccessible: 'afterFirstUnlock',
    });
    password.value = '';
  }

  return (
    <SafeArea flex={1}>
      <VStack
        flex={1}
        padding={24}
        gap={12}
        justifyContent="center"
        keyboard={{ avoid: 'position' }}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          maxLength={254}
          enterKeyHint="next"
          value={email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          submitBehavior="blurAndSubmit"
          value={password}
          onSubmit={submit}
        />
        <Text>{problem.value}</Text>
        <Button onPress={() => void submit()}>Sign in</Button>
      </VStack>
    </SafeArea>
  );
}
```

`secureStore.get` on mount skips the form when a token is already saved. `secureStore.delete` is sign-out. The keychain answers off the UI, so the screen shows the form until the read settles.

## Related

- [Keyboard](../keyboard.md#pick-the-keyboard-and-autofill): every field hint
- [Keyboard](../keyboard.md#keep-inputs-above-the-keyboard): avoidance
- [Testing](../testing.md): faking a module and `fetch`
