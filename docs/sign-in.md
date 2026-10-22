# Build a sign-in form

Use this pattern for a password form with autofill, keyboard submission, a pending state and a session token stored in the platform keychain. Replace the endpoint with your authentication service.

## Submit and save a session

```tsx
import { Button, SafeArea, Text, TextField, VStack, secureStore, signal, task } from 'kuito';

export default function SignIn() {
  const email = signal('');
  const password = signal('');
  const signedIn = signal(false);
  const signIn = task(
    async ({ signal: abort }) => {
      if (!email.value.includes('@') || !password.value)
        throw new Error('Enter your email and password.');
      const response = await fetch('https://example.com/api/session', {
        method: 'POST',
        signal: abort,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      });
      if (!response.ok) throw new Error('Sign-in failed. Check your details and try again.');
      const body: unknown = await response.json();
      if (
        typeof body !== 'object' ||
        body === null ||
        typeof Reflect.get(body, 'token') !== 'string'
      ) {
        throw new Error('The server returned an invalid session.');
      }
      await secureStore.set('session-token', Reflect.get(body, 'token'));
      password.value = '';
      signedIn.value = true;
    },
    { policy: 'drop' },
  );
  const submit = () => void signIn.run().catch(() => {});

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
          value={email}
          enterKeyHint="next"
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          enterKeyHint="go"
          submitBehavior="blurAndSubmit"
          onSubmit={submit}
        />
        <Button disabled={signIn.running.value} onPress={submit}>
          {signIn.running.value ? 'Signing in…' : 'Sign in'}
        </Button>
        <Text>
          {signIn.error.value ? String(signIn.error.value) : signedIn.value ? 'Signed in' : ''}
        </Text>
      </VStack>
    </SafeArea>
  );
}
```

The task prevents duplicate submissions and exposes errors to the screen. Field hints help the keyboard and password manager; keyboard avoidance keeps the focused field visible. Clearing the password happens only after the token is saved.

On startup, read the saved token and validate it with your service before treating the session as active. Sign out with `await secureStore.delete('session-token')`. Continue to [secure storage](secure-store.md), [async actions](async.md) and [keyboard behavior](keyboard.md).
