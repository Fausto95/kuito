# Test a screen without a device

Use kuito/tests to render app components on the headless host, interact with them and assert user-visible behavior. No simulator or platform SDK is needed for these tests.

## Test a button interaction

Put the test in tests/counter.test.tsx. Render the real component, find its accessible button, perform the action and assert the visible result.

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

## Test a form

Await interactions so their state changes settle. type enters text, press activates a control, choose selects a native option, and scroll moves a Scroll or List. Use screen queries for visible content and within(view) to restrict a query.

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

## Fake platform and network behavior

Pass native module fakes and a fetch handler to render. The fake uses the module spec name, not its root namespace alias. Requests without a fetch fake fail, which keeps the test independent of the network.

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

## Test time and cost

advance(ms) moves the test clock for timers and animations. costOf measures deterministic work counts for an interaction; set budgets around meaningful regressions. replay runs recorded interactions. The API reference documents these tools and the returned TestView methods.

## Keep device tests for platform behavior

The host checks state, events and layout, not pixels or platform integrations. It does not verify camera hardware, notifications, media decoding, store signing or real screen readers. Validate those on iOS and Android devices, including failure and permission-denied paths.

## Continue

See [performance](performance.md) for cost budgets and [test APIs](https://kuito.dev/docs/apis/tests.render) for every helper.
