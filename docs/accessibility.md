# Make screens accessible

Use native semantics, clear labels and scalable text so a screen works with screen readers and different input methods. Treat accessibility as part of each component’s behavior.

## Label a custom control

A native Button supplies its role from the component. A custom Pressable needs a meaningful accessible name and state. Describe the action rather than the icon shape.

```tsx
import { Pressable, Symbol, signal } from 'kuito';

export function PlayButton() {
  const ready = signal(true);
  const playing = signal(false);

  return (
    <Pressable
      role="button"
      label="Play"
      hint="Starts the episode"
      aria-disabled={!ready.value}
      onPress={() => (playing.value = true)}
    >
      <Symbol name={{ ios: 'play.fill', android: 'play_arrow' }} />
    </Pressable>
  );
}
```

## Offer semantic actions

Expose supported accessibility actions for interactions that would otherwise require a gesture. Handle the action by name and keep the resulting state visible.

```tsx
import { HStack, Text, signal } from 'kuito';

export function Rating() {
  const stars = signal(3);
  const change = (by: number) => (stars.value = Math.min(5, Math.max(0, stars.value + by)));

  return (
    <HStack
      accessible
      role="slider"
      label="Rating"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={stars.value}
      actions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAction={(event) => change(event.actionName === 'increment' ? 1 : -1)}
    >
      <Text>{'★'.repeat(stars.value)}</Text>
    </HStack>
  );
}
```

## Respond to screen reader and motion settings

Read accessibility.screenReader and reduceMotion reactively when behavior must change. Use announce for a concise outcome and focus to move accessibility focus deliberately. Keyboard focus and screen-reader focus are different.

```tsx
import { Pressable, Text, accessibility, ref, signal, watch } from 'kuito';

export function Results() {
  const title = ref();
  const animations = signal(true);

  accessibility.announce('12 shows found');
  accessibility.announce('Saved', { queue: true });
  watch(accessibility.reduceMotion, (calm) => {
    animations.value = !calm;
  });

  return (
    <Pressable onPress={() => title.current && accessibility.focus(title.current)}>
      <Text ref={title}>{accessibility.screenReader.value ? 'Screen reader on' : 'Results'}</Text>
    </Pressable>
  );
}
```

## Announce changing status

Use a live region for ongoing status changes. Prefer polite announcements and avoid announcing every frame or keystroke. Give the user time to understand a message.

```tsx
import { Text, signal } from 'kuito';

export function Status() {
  const status = signal('Uploading…');
  return <Text live="polite">{status.value}</Text>;
}
```

## Verify on devices

Test with VoiceOver and TalkBack, large text, reduced motion and right-to-left layout. Headless role queries catch missing semantics, but they do not reproduce a screen reader or verify contrast and visual clipping.

## Continue

See [testing](testing.md), [localization](localization.md) and [Text](text.md).
