# Build forms that work with the keyboard

Use TextField bindings, scroll-view avoidance and keyboard signals to keep editing comfortable. Start with native avoidance before adding custom motion.

## Keep a focused field visible

```tsx
import { HStack, List, SafeArea, Text, TextField, signal } from 'kuito';

export default function Chat() {
  const messages = signal<{ id: string; text: string }[]>([]);
  const draft = signal('');

  function send() {
    messages.value = [...messages.value, { id: String(Date.now()), text: draft.value }];
    draft.value = '';
  }

  return (
    <SafeArea flex={1}>
      <List flex={1} data={messages} renderItem={({ item }) => <Text>{item.text}</Text>} />
      <HStack keyboard={{ avoid: 'padding' }}>
        <TextField
          flex={1}
          placeholder="Message"
          enterKeyHint="send"
          value={draft}
          onSubmit={send}
        />
      </HStack>
    </SafeArea>
  );
}
```

## Control text selection

```tsx
import { Button, TextField, VStack, signal } from 'kuito';

export default function Composer() {
  const draft = signal('');
  const selection = signal({ start: 0, end: 0 });

  function insert(text: string) {
    const { start, end } = selection.value;

    draft.value = draft.value.slice(0, start) + text + draft.value.slice(end);
    selection.value = { start: start + text.length, end: start + text.length };
  }

  return (
    <VStack>
      <TextField value={draft} selection={selection} />
      <Button onPress={() => insert('👋')}>Wave</Button>
    </VStack>
  );
}
```

## Format input as the user types

```tsx
import { TextField, signal } from 'kuito';

function cardNumber(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 19);

  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export default function CardField() {
  const card = signal('');

  return (
    <TextField inputMode="numeric" autoComplete="cc-number" value={card} format={cardNumber} />
  );
}
```

## Allow multiple lines

```tsx
import { TextField, VStack, signal } from 'kuito';

export default function Note() {
  const description = signal('');
  const message = signal('');

  return (
    <VStack gap={12}>
      <TextField lines={4} placeholder="Description" value={description} />
      <TextField
        lines={{ max: 5 }}
        placeholder="Message"
        enterKeyHint="send"
        submitBehavior="submit"
        value={message}
        onSubmit={() => (message.value = '')}
      />
    </VStack>
  );
}
```

## Dismiss and observe the keyboard

```tsx
import { Box, Button, Text, VStack, keyboard } from 'kuito';

export default function KeyboardState() {
  keyboard.frame.value; // { screenX, screenY, width, height } or null

  // In a component, until it unmounts; elsewhere, until remove().
  keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

  return (
    <VStack>
      <Text>{keyboard.visible.value ? 'typing' : ''}</Text>
      {/* Rides on the keyboard. */}
      <Box translateY={keyboard.height.map((height) => -height)} />
      <Button onPress={() => keyboard.dismiss()}>Done</Button>
    </VStack>
  );
}
```

## Behavior and limits

Vertical Scroll and List can inset their content and move the focused field above the keyboard. Configure dismissal on drag for long forms. `keyboard.height` is a motion source for custom UI that tracks the keyboard; avoid applying both automatic and manual offsets to the same content. `keyboard.visible` and `frame` are state signals. Preserve selection when formatting text, and provide a meaningful label instead of relying only on a placeholder.

## Continue

Read [Text field](text-field.md) for the related workflow. The API reference lists every method, option, event and return type.
