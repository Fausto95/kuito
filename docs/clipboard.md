# Copy and paste text

Use the clipboard for user-requested copy and paste actions, such as copying a code or inserting a shared URL.

## Copy text and offer a paste action

```tsx
import { Pressable, Text, VStack, clipboard, signal } from 'kuito';

export function InviteCode() {
  const pasted = signal('');

  return (
    <VStack gap={12}>
      <Pressable onPress={() => void clipboard.writeText('KUITO-2026')}>
        <Text>Copy the code</Text>
      </Pressable>
      <Pressable
        disabled={!clipboard.hasText.value}
        onPress={() => {
          void clipboard.readText().then((text) => {
            pasted.value = text;
          });
        }}
      >
        <Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>
      </Pressable>
      <Text>{pasted.value}</Text>
    </VStack>
  );
}
```

## Behavior and limits

`writeText` writes a string and `readText` returns the current text. `hasText` lets the UI offer a paste affordance without reading the content. Read clipboard contents in response to the user action: the operating system may show a privacy notice or permission UI. Do not treat clipboard contents as trusted input.

## Continue

Read [Share](share.md) for the related workflow. The API reference lists every method, option, event and return type.
