import {
  Button,
  SafeArea,
  Show,
  Text,
  TextField,
  VStack,
  onMount,
  secureStore,
  signal,
} from 'kuito';

// A sign-in screen: fields that tell the keyboard and the password manager
// what they hold, a form that stays clear of the keyboard, and a session
// token kept in the keychain rather than in plain storage.

const TOKEN_KEY = 'session-token';
const SESSIONS_URL = 'https://api.example.com/sessions';

/** The token the server answers with, or an error that says what went wrong. */
async function requestToken(email: string, password: string): Promise<string> {
  const response = await fetch(SESSIONS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (response.status === 401) throw new Error('That email and password don’t match.');
  if (!response.ok) throw new Error(`The server answered ${response.status}. Try again.`);

  const body: unknown = await response.json();
  const token = typeof body === 'object' && body !== null ? Reflect.get(body, 'token') : null;

  if (typeof token !== 'string') throw new Error('The server sent no token.');

  return token;
}

export default function SignIn() {
  const email = signal('');
  const password = signal('');
  const problem = signal('');
  const busy = signal(false);
  const session = signal<string | null>(null);

  // The keychain answers on a background thread: the form shows until then.
  onMount(() => {
    secureStore.get(TOKEN_KEY).then(
      (token) => (session.value = token),
      (error: Error) => (problem.value = error.message),
    );
  });

  async function submit() {
    if (busy.value) return;
    if (!email.value.includes('@')) return void (problem.value = 'Enter your email address.');
    if (password.value.length < 8) return void (problem.value = 'Use at least 8 characters.');

    busy.value = true;
    problem.value = '';

    try {
      const token = await requestToken(email.value, password.value);

      await secureStore.set(TOKEN_KEY, token, { keychainAccessible: 'afterFirstUnlock' });
      session.value = token;
      password.value = '';
    } catch (error) {
      problem.value = error instanceof Error ? error.message : String(error);
    } finally {
      busy.value = false;
    }
  }

  async function signOut() {
    await secureStore.delete(TOKEN_KEY);
    session.value = null;
  }

  return (
    <SafeArea flex={1}>
      <Show
        when={session.value}
        fallback={
          // Lifts the form until the focused field clears the keyboard.
          <VStack
            flex={1}
            padding={24}
            gap={12}
            justifyContent="center"
            keyboard={{ avoid: 'position' }}
          >
            <Text fontSize={28} fontWeight="bold">
              Sign in
            </Text>
            <TextField
              label="Email"
              placeholder="you@example.com"
              type="email"
              autoComplete="username"
              maxLength={254}
              enterKeyHint="next"
              value={email}
            />
            <TextField
              label="Password"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              submitBehavior="blurAndSubmit"
              value={password}
              onSubmit={submit}
            />
            <Text color="#d70015">{problem.value}</Text>
            <Button disabled={busy.value} onPress={submit}>
              {busy.value ? 'Signing in…' : 'Sign in'}
            </Button>
          </VStack>
        }
      >
        <VStack flex={1} padding={24} gap={16} justifyContent="center">
          <Text fontSize={22} fontWeight="bold">
            You’re signed in
          </Text>
          <Button onPress={signOut}>Sign out</Button>
        </VStack>
      </Show>
    </SafeArea>
  );
}
