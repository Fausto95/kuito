# Testing

An app's tests render its components on the headless host: the kernel the app runs on devices, in Node, with the shells' own C++ layout compiled to WebAssembly, so no simulator, emulator or SDK is involved.

**Use it for**

- Checking what a screen shows after a tap or some typing.
- Faking native modules and network answers.
- Holding an interaction's cost on the main thread to a budget.

```tsx
// tests/counter.test.tsx
import { Button, Text, VStack, signal } from 'kuito';
import { assert, press, render, screen, test } from 'kuito/tests';

function Counter() {
  const count = signal(0);
  return (
    <VStack>
      <Text>{`Pressed ${count.value} times`}</Text>
      <Button onPress={() => count.value++}>Add one</Button>
    </VStack>
  );
}

test('Add one counts the presses', async () => {
  await render(<Counter />);

  await press(screen.getByRole('button', { name: 'Add one' }));

  assert.ok(screen.getByText('Pressed 1 times'));
});
```

```sh
kuito test                         # every *.test.ts and *.test.tsx
kuito test tests/counter.test.tsx
kuito test android                 # compile for Android instead of iOS
```

`kuito test` runs each file in a host of its own with Node's test runner. A test file is compiled like the app (styles, routes, UI-thread code, native module stubs), so it imports the app's components as they are. `kuito/tests` also exports Node's `test`, `describe` and strict `assert`: a test file needs one import.

## Find what is on screen

`screen` queries what the last render shows; `within(view)` queries inside one view. A hidden subtree, a closed sheet and a screen under another in its stack do not count.

- `getByText(text)`: the one view showing `text`, a whole string or a RegExp.
- `getByRole(role, { name })`: the one view with that ARIA role and accessible name. A view without `role` has its kind's: `Button` is a `button`, `Toggle` a `switch`, `TextField` a `textbox`, `Image` an `img`.
- `getAllBy…` returns every match and throws on none; `queryBy…` returns null on none and throws on several. A `get` that finds none throws with the tree.

## Tap, type and scroll

Each interaction sends the events a device's views send, then settles what they started. Await it.

```tsx
import { Button, Text, TextField, VStack, signal } from 'kuito';
import { assert, press, render, screen, test, type } from 'kuito/tests';

function SignIn() {
  const email = signal('');
  const error = signal('');
  return (
    <VStack>
      <TextField label="Email" value={email} />
      <Button onPress={() => (error.value = email.value.includes('@') ? '' : 'Invalid email')}>
        Sign in
      </Button>
      <Text>{error.value}</Text>
    </VStack>
  );
}

test('a malformed email shows an error', async () => {
  await render(<SignIn />);

  await type(screen.getByRole('textbox', { name: 'Email' }), 'ada');
  await press(screen.getByRole('button', { name: 'Sign in' }));

  assert.ok(screen.getByText('Invalid email'));
});
```

- `press(view, { long })` taps the view, or the Pressable, Button or Toggle it is in.
- `type(view, text)` types into a TextField one character at a time, through its `format` if it has one.
- `scroll(view, { x, y })` scrolls the Scroll or List the view is in, binding the rows that come near.
- `choose(view, value)` picks a date in a DatePicker, or by its label an option of a Select, a segment of a SegmentedControl or an item of a ContextMenu.
- `advance(ms)` moves the test's clock: timers and animations run only as it advances.

## Fake native modules and the network

`render` takes fakes by the module specs' names, and a `fetch` that answers the app's requests. Without it a request fails.

```tsx
import { Text, clipboard } from 'kuito';
import { assert, render, screen, test } from 'kuito/tests';

function PasteHint() {
  return <Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
}

test('the hint follows the clipboard', async () => {
  await render(<PasteHint />, {
    modules: { Clipboard: { hasText: true } },
    fetch: () => ({ status: 200, body: '{}' }),
  });

  assert.ok(screen.getByText('Paste'));
});
```

A function's fake returns the result, or throws `{ code, message }`; a live value's fake is its value. Fake `Localization: { locales: [{ textDirection: 'rtl', … }] }` to test right to left.

## Hold an interaction to a budget

`costOf(interaction)` returns what an interaction cost the main thread, in counts that do not depend on the machine, so a budget fails like a bug and never flakes ([Performance](./performance.md#hold-an-interaction-to-a-budget)).

## What it leaves out

- Pixels: colors, shadows, images and transforms are props in the tree, not drawn.
- Platform chrome and controls take an iPhone's sizes on iOS 27, whichever platform the test compiles for.
- Every list row gets a cell of its own; there is no cell reuse.

## Related

- [Accessibility](./accessibility.md): the roles and labels queries find
- [Performance](./performance.md): cost counters
- [Testing in depth](../../../../docs/testing.md): font tables for exact layouts, golden tests from recordings, how the host works
