# Add touch feedback

Use haptics to confirm selection, communicate success or failure, or reinforce a physical-feeling interaction.

## Distinguish selection, impact and notification feedback

```tsx
import { HStack, Pressable, Text, haptics, signal } from 'kuito';

async function save(count: number): Promise<void> {
  if (count > 9) throw new Error('At most 9 seats');
}

export function Seats() {
  const count = signal(1);

  return (
    <HStack gap={12}>
      <Pressable
        onPress={() => {
          count.value += 1;
          void haptics.selection();
        }}
      >
        <Text>{'Seats: ' + count.value}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          save(count.value).then(
            () => haptics.notification('success'),
            () => haptics.notification('error'),
          );
        }}
      >
        <Text>{haptics.supported ? 'Book' : 'Book (no haptics)'}</Text>
      </Pressable>
    </HStack>
  );
}
```

## Behavior and limits

Use `selection()` for a changed choice, `impact(style)` for a collision-like response, and `notification(type)` for an outcome. `supported` reports device support. Simulators and devices without the relevant hardware may produce no feedback. Haptics should supplement a visible or spoken cue.

## Continue

Read [Pressable](pressable.md) for the related workflow. The API reference lists every method, option, event and return type.
