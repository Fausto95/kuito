import { Button, Text, VStack, clipboard, signal } from 'kuito';
import { assert, press, render, screen, test, type ModuleFake } from 'kuito/tests';

function Paste() {
  const pasted = signal('');

  return (
    <VStack>
      <Button onPress={async () => (pasted.value = await clipboard.readText())}>Paste</Button>
      <Text>{pasted.value}</Text>
    </VStack>
  );
}

// The Clipboard module's members, by name: what each call returns.
const clipboardWith = (text: string): ModuleFake => ({
  hasText: async () => text !== '',
  readText: async () => text,
});

test('paste shows what the clipboard holds', async () => {
  await render(<Paste />, { modules: { Clipboard: clipboardWith('KUITO-42') } });

  await press(screen.getByText('Paste'));

  assert.ok(screen.getByText('KUITO-42'));
});
