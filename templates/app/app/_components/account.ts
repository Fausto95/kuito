import { signal } from 'kuito';

/**
 * Who is signed in. A real app asks its server and keeps a token in
 * secureStore; this one keeps the account in memory, so the forms have
 * something to do.
 */
export interface Account {
  name: string;
  email: string;
}

export const account = signal<Account | null>(null);

export const PASSWORD_LENGTH = 8;

const emailProblem = (email: string) => (email.includes('@') ? null : 'Enter your email address.');

const passwordProblem = (password: string) =>
  password.length < PASSWORD_LENGTH ? `Use at least ${PASSWORD_LENGTH} characters.` : null;

/** Signs in, or says what is wrong with the form. */
export function signIn(email: string, password: string): string | null {
  const problem = emailProblem(email) ?? passwordProblem(password);

  if (!problem) account.value = { name: email.slice(0, email.indexOf('@')), email };

  return problem;
}

/** Makes the account and signs in, or says what is wrong with the form. */
export function signUp(name: string, email: string, password: string): string | null {
  const problem =
    (name.trim() ? null : 'Enter your name.') ?? emailProblem(email) ?? passwordProblem(password);

  if (!problem) account.value = { name: name.trim(), email };

  return problem;
}

export function signOut() {
  account.value = null;
}
