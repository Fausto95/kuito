# Build a screen

Compose native views with TSX. Start with a stack for layout, add text and
controls, then connect them to state. Use this guide when building a screen or
extracting a reusable component.

## Build a settings row

```tsx
import { HStack, SafeArea, Spacer, Text, Toggle, VStack, signal } from 'kuito';

export default function Settings() {
  const reminders = signal(true);

  return (
    <SafeArea padding={20} gap={24}>
      <Text fontSize={28} fontWeight="bold">
        Settings
      </Text>
      <HStack gap={12}>
        <VStack gap={4}>
          <Text>Daily reminder</Text>
          <Text color="#64748b">A nudge to finish your list</Text>
        </VStack>
        <Spacer />
        <Toggle label="Daily reminder" checked={reminders} />
      </HStack>
      <Text>{reminders.value ? 'Reminders are on' : 'Reminders are off'}</Text>
    </SafeArea>
  );
}
```

`VStack` places children vertically; `HStack` places them horizontally.
`Spacer` uses available room. `SafeArea` keeps content clear of system insets.
The `Toggle` reads and writes the signal passed as `value`.

## Choose a component

| Need                     | Components                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| Arrange content          | `VStack`, `HStack`, `Box`, `Spacer`, `Divider`, `SafeArea`                  |
| Display information      | `Text`, `Image`, `Symbol`, `Drawing`                                        |
| Collect input            | `TextField`, `Toggle`, `Slider`, `DatePicker`, `Select`, `SegmentedControl` |
| Run an action            | `Button` for a system button; `Pressable` for a custom surface              |
| Scroll content           | `Scroll` for a small page; `List` for recycled rows                         |
| Show an overlay          | `Sheet`, `ContextMenu`                                                      |
| Change screens           | `Link`, `Router`, `Tabs`                                                    |
| Show conditional content | `Show`, `Switch` with `Match`, `For`, `Catch`, `Loading`                    |

The [component reference](https://kuito.dev/docs/components) gives a complete
example, behavior notes and props for every component, including the drawing,
media and system UI components.

## Extract a reusable component

Read props inside JSX to keep them reactive. Destructuring a changing prop in
the function body captures its initial value.

```tsx
import { Button, Text, VStack, signal } from 'kuito';

function Total(props: { count: number }) {
  return <Text>{`${props.count} selected`}</Text>;
}

export function Selection() {
  const count = signal(0);
  return (
    <VStack gap={12}>
      <Total count={count.value} />
      <Button onPress={() => count.value++}>Select one more</Button>
    </VStack>
  );
}
```

Component functions return Kuito elements. They do not use React hooks or a DOM.
Use [styles](styles.md) for shared appearance, [control flow](control-flow.md)
for changing structure, and [refs](refs.md) for imperative view operations.
