// The sign-in and sign-up sheets on the headless host: what their fields
// tell the keyboard and autofill, and what the forms do with what is typed.
import { assert, press, render, screen, test, type } from 'kuito/tests';
import { account, signOut } from '../app/_components/account';
import SignIn from '../app/sign-in';
import SignUp from '../app/sign-up';

const field = (name: string) => screen.getByRole('textbox', { name });
// A function, so a check that no one is signed in narrows nothing after it.
const signedIn = () => account.value;

test('the sign-in fields ask for an email and the saved password', async () => {
  await render(<SignIn dismiss={() => {}} />);

  assert.deepEqual(
    [field('Email').props.type, field('Email').props.autoComplete],
    ['email', 'username'],
  );

  assert.deepEqual(
    [field('Password').props.type, field('Password').props.autoComplete],
    ['password', 'current-password'],
  );
});

test('signing in needs a password of eight characters', async () => {
  signOut();

  let closed = false;

  await render(<SignIn dismiss={() => (closed = true)} />);
  await type(field('Email'), 'ada@example.com');
  await type(field('Password'), 'short');
  await press(screen.getByRole('button', { name: 'Sign in' }));

  assert.ok(screen.getByText('Use at least 8 characters.'));
  assert.equal(signedIn(), null);

  await type(field('Password'), 'enough');
  await press(screen.getByRole('button', { name: 'Sign in' }));

  assert.equal(signedIn()?.email, 'ada@example.com');
  assert.ok(closed, 'the sheet closes');
});

test('signing up takes a name, a new password and a short bio', async () => {
  signOut();

  await render(<SignUp dismiss={() => {}} />);

  assert.deepEqual(
    [field('Name').props.autoComplete, field('Name').props.autoCapitalize],
    ['name', 'words'],
  );

  assert.equal(field('New password').props.autoComplete, 'new-password');
  assert.equal(field('About you').kind, 'MultilineTextField', 'the bio wraps');

  await type(field('Name'), 'Ada Lovelace');
  await type(field('Email'), 'ada@example.com');
  await type(field('New password'), 'analytical');
  await type(field('About you'), 'I wrote the first program.');

  assert.ok(screen.getByText('26 / 160'));

  await press(screen.getByRole('button', { name: 'Create account' }));

  assert.equal(signedIn()?.name, 'Ada Lovelace');
});
