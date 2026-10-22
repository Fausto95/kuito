# clipboard

The system clipboard's text: `UIPasteboard` on iOS, `ClipboardManager` on
Android.

Use it for:

- a Copy button beside a link, a code or an address;
- a Paste button that fills a field from what the user copied elsewhere;
- showing that Paste only while the clipboard holds text.

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

## API

| Member                      | Returns            | Does                                                                      |
| --------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `clipboard.hasText`         | a `boolean` signal | Whether the clipboard holds text, without reading it. Read `.value`.      |
| `clipboard.readText()`      | `Promise<string>`  | Resolves with the clipboard's text, or `''` when it holds none.           |
| `clipboard.writeText(text)` | `Promise<void>`    | Replaces the clipboard's content with `text`, as plain text, and settles. |

`hasText` is a signal that follows the platform only while something watches
it, a read in JSX or a `watch` ([observed only while
watched](native-modules.md#observed-only-while-watched)): it then changes
when this app or another one copies. Unwatched, a read asks the platform
synchronously. It never reads the content itself, so it never makes iOS ask
the user to allow a paste. `readText` and `writeText` run on the main
thread. A failure rejects with a `NativeModuleError` whose message names
`Clipboard.readText` or `Clipboard.writeText`, and a `text` that is not a
string rejects with `ERR_ARGUMENT` before anything reaches the platform
([errors](native-modules.md#errors)).

## Platforms

|                   | iOS                                                                         | Android                                                                |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `hasText`         | `UIPasteboard.hasStrings`                                                   | the primary clip's description lists `text/plain` or `text/html`       |
| `hasText` follows | this app's writes at once, another app's when this one becomes active again | `OnPrimaryClipChangedListener`                                         |
| `readText()`      | `UIPasteboard.string`; the system may ask the user to allow the paste       | the primary clip's first item, coerced to text (HTML loses its markup) |
| `writeText(text)` | sets `UIPasteboard.string`                                                  | sets a plain-text `ClipData`, labeled `Kuito`                          |

Neither platform needs a permission or a `kuito.config.ts` entry. Only text
crosses: images and other content types are neither read nor written.

## Tests

The [test host](testing.md#native-modules) fakes the module by its spec's
name: `modules: { Clipboard: { readText: async () => 'copied' } }`.
`writeText` does nothing unless faked, and `readText` and `hasText` fail
with `ERR_FUNCTION_NOT_FOUND` until a fake answers them.

## Related

- [Native modules](native-modules.md): how `clipboard` is declared and linked.
- [haptics](haptics.md): feedback to play when a copy succeeds.
- [share](share.md): hand text or a URL to another app instead.
