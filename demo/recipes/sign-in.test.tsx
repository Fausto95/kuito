// The sign-in recipe on the headless host: what its fields tell the keyboard
// and autofill, what the form says before it asks the server, and where the
// token goes once it answers.
import { assert, press, render, screen, test, type, type FetchHandler } from 'kuito/tests';
import SignIn from './sign-in';

const field = (name: string) => screen.getByRole('textbox', { name });

/** A keychain in memory, as the SecureStore module's fakes. */
function keychain(saved: Record<string, string> = {}) {
  const items = new Map(Object.entries(saved));

  return {
    items,
    modules: {
      SecureStore: {
        getItem: ({ key }: { key: string }) => items.get(key) ?? null,
        setItem: ({ key, value }: { key: string; value: string }) => void items.set(key, value),
        deleteItem: ({ key }: { key: string }) => void items.delete(key),
      },
    },
  };
}

const server: FetchHandler = ({ body }) =>
  body?.includes('"password":"correct horse"')
    ? { body: JSON.stringify({ token: 'tok_42' }) }
    : { status: 401 };

test('the fields ask for an email and the saved password', async () => {
  await render(<SignIn />, { modules: keychain().modules });

  assert.deepEqual(
    [
      field('Email').props.type,
      field('Email').props.autoComplete,
      field('Email').props.enterKeyHint,
    ],
    ['email', 'username', 'next'],
  );

  assert.deepEqual(
    [field('Password').props.type, field('Password').props.autoComplete],
    ['password', 'current-password'],
  );
});

test('a short password is caught before any request', async () => {
  let requests = 0;
  const fetch: FetchHandler = () => (requests++, { status: 500 });

  await render(<SignIn />, { modules: keychain().modules, fetch });
  await type(field('Email'), 'ada@example.com');
  await type(field('Password'), 'short');
  await press(screen.getByRole('button', { name: 'Sign in' }));

  assert.ok(screen.getByText('Use at least 8 characters.'));
  assert.equal(requests, 0);
});

test('a wrong password says so and stores nothing', async () => {
  const { items, modules } = keychain();

  await render(<SignIn />, { modules, fetch: server });
  await type(field('Email'), 'ada@example.com');
  await type(field('Password'), 'battery staple');
  await press(screen.getByRole('button', { name: 'Sign in' }));

  assert.ok(screen.getByText('That email and password don’t match.'));
  assert.equal(items.size, 0);
});

test('signing in keeps the token in the keychain, and signing out removes it', async () => {
  const { items, modules } = keychain();

  await render(<SignIn />, { modules, fetch: server });
  await type(field('Email'), 'ada@example.com');
  await type(field('Password'), 'correct horse');
  await press(screen.getByRole('button', { name: 'Sign in' }));

  assert.ok(screen.getByText('You’re signed in'));
  assert.equal(items.get('session-token'), 'tok_42');

  await press(screen.getByRole('button', { name: 'Sign out' }));

  assert.ok(screen.getByRole('textbox', { name: 'Email' }));
  assert.equal(items.size, 0);
});

test('a token saved by an earlier launch skips the form', async () => {
  await render(<SignIn />, { modules: keychain({ 'session-token': 'tok_old' }).modules });

  assert.ok(screen.getByText('You’re signed in'));
});
