# alert and prompt

Native alerts as promises: `UIAlertController` on iOS, a Material dialog on
Android. `prompt()` asks for text on both platforms.

```tsx
import { alert, prompt } from 'kuito';

declare function removeEpisode(id: string): Promise<void>;
declare function renameList(id: string, name: string): void;

export async function confirmDelete(episodeId: string) {
  const remove = { text: 'Delete', style: 'destructive' } as const;
  const picked = await alert({
    title: 'Delete episode?',
    message: 'It leaves your downloads.',
    buttons: [{ text: 'Cancel', style: 'cancel' }, remove],
  });

  if (picked === remove) await removeEpisode(episodeId);
}

export async function askName(listId: string) {
  const answer = await prompt({ title: 'Rename list' });

  if (answer?.button.text === 'OK' && typeof answer.value === 'string')
    renameList(listId, answer.value);
}
```

## `alert(options)`

Shows the alert and resolves with the button the user picked, the same
object `buttons` holds, or `null` when the alert was dismissed without one.
Without `buttons`, one OK button.

| Button field | Does                                                              |
| ------------ | ----------------------------------------------------------------- |
| `text`       | The label.                                                        |
| `style`      | `default`, `cancel` or `destructive` (red). At most one `cancel`. |
| `preferred`  | iOS: the button Return picks, in bold.                            |

| Option             | Does                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `title`, `message` | The alert's text.                                                     |
| `buttons`          | The buttons, in order.                                                |
| `cancelable`       | Android: Back or a tap outside dismisses the alert. False by default. |
| `colorScheme`      | iOS: `light` or `dark` regardless of the app's appearance.            |

Two `cancel` buttons reject with a `TypeError` before anything shows: UIKit raises on
them. Android places buttons as React Native does: the last is positive, the
one before negative, a third neutral, and more than three fail with
`ERR_ARGUMENT`. A `destructive` button is drawn in the theme's error color.

## `prompt(options)`

An alert with text fields. It takes `alert`'s options, with Cancel and OK as
the default buttons, and resolves `{ button, value }`: the button picked and
what the user typed, or `null` when dismissed.

Its field takes TextField's names ([what a field takes](keyboard.md#what-a-field-takes)):

| `type`     | Fields                                            | resolves `value`         |
| ---------- | ------------------------------------------------- | ------------------------ |
| `text`     | one (the default), starting with `value`          | the text                 |
| `password` | one, hidden                                       | the text                 |
| `login`    | a username, starting with `value`, and a password | `{ username, password }` |

`inputMode` picks the keyboard, as on a TextField: `text` (the default),
`decimal`, `numeric`, `tel`, `search`, `email` or `url`. A `password` takes
it too: `type: 'password', inputMode: 'numeric'` asks for a PIN. A `login`'s
fields tell the password manager they hold a username and a password, so it
offers the saved ones. On Android the fields are Material text fields in the
dialog, the keyboard opens with it, and Done on the last field presses the
last button, which the keyboard can cover on a short screen.

```tsx
import { prompt } from 'kuito';

declare function signIn(username: string, password: string): Promise<void>;

export async function askPin() {
  const pin = await prompt({ title: 'Passcode', type: 'password', inputMode: 'numeric' });

  return typeof pin?.value === 'string' ? pin.value : null;
}

export async function askLogin() {
  const login = await prompt({ title: 'Sign in', type: 'login', inputMode: 'email' });

  if (login && typeof login.value !== 'string')
    await signIn(login.value.username, login.value.password);
}
```

A reload closes the alerts still open; their promises never settle.
