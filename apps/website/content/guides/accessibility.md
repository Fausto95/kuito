# Accessibility

One set of accessibility props works on every view, on both platforms, with VoiceOver on iOS and TalkBack on Android: `label`, `hint`, `role` (ARIA's names), `live`, `actions`, and ARIA's `aria-*` facts.

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

## Props

- `accessible` makes the view one element, read as its `label` or, without one, its children's text.
- `label` is what the screen reader reads; `hint` is what happens on activation, read after a pause.
- `role` is what the view is, in ARIA's names: `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab` and more. A role outside the supported ones is an error naming them.
- `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy` and `aria-expanded` are the view's state; `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` a range, or a textual value.
- `aria-hidden`: screen readers skip the view and its subtree.
- `actions` lists standard actions, or custom ones by `label`; `onAction` is called with `{ actionName }` when one is performed.

A Pressable is one element, read as its children's text, so it needs something to read: give it a `label`, or text among its children. A Pressable with neither (an icon alone) is a build error naming its line. Each fact is its own native prop, so changing one updates only that one.

## Actions

`activate`, `increment`, `decrement` and `longpress` replace the reader's own gestures: double tap, swipe up and down on an adjustable element on iOS, and TalkBack's click, scroll forward and back, and long click. `magicTap` and `escape` are VoiceOver gestures with no TalkBack equivalent. Any other name is a custom action, in VoiceOver's actions rotor and TalkBack's actions menu, under its `label`.

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

## The accessibility module

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

- An announcement interrupts current speech; `queue: true` waits for it (iOS; TalkBack always queues).
- `focus` takes an element, such as `ref.current`.
- `screenReader` and `reduceMotion` are signals. The first read asks the native side once and is `null` until it answers; the answer and every later change update both.

## Live regions

`live` announces changes to a view's text: `polite` waits for current speech, `assertive` interrupts it. Android has live regions natively; on iOS Kuito watches Text inside the region and, once a batch of changes has applied, announces what the region now reads.

```tsx
import { Text, signal } from 'kuito';

export function Status() {
  const status = signal('Uploading…');
  return <Text live="polite">{status.value}</Text>;
}
```

## In depth

[Accessibility](../../../../docs/accessibility.md) covers how each role and state reads in VoiceOver and TalkBack, what iOS 16 needs, and how announcements and actions cross the native boundary.
