# Accessibility

One set of accessibility props works on every view, on both platforms, with
VoiceOver on iOS and TalkBack on Android: `label`, `hint`, `role` (ARIA's
names), `live`, `actions`, and ARIA's `aria-*` facts.

```tsx
import { Image, Pressable, signal } from 'kuito';
import icon from './play.png';

const ready = signal(false);

function play() {
  // start the episode
}

<Pressable
  role="button"
  label="Play"
  hint="Starts the episode"
  aria-disabled={!ready.value}
  onPress={play}
>
  <Image src={icon} />
</Pressable>;
```

## Props

| Prop                                                                           | Meaning                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `accessible`                                                                   | Makes the view one element, read as its `label` or, without one, its children's text.                          |
| `label`                                                                        | What the screen reader reads.                                                                                  |
| `hint`                                                                         | What happens on activation, read after a pause.                                                                |
| `role`                                                                         | What the view is, in ARIA's names: `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab`, ... (below). |
| `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy`, `aria-expanded` | The view's state; `aria-checked` may be `'mixed'`.                                                             |
| `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`            | A range, or a textual value.                                                                                   |
| `aria-hidden`                                                                  | Screen readers skip the view and its subtree.                                                                  |
| `live`                                                                         | `off`, `polite` or `assertive`: changes to the view's text are announced; see [live regions](#live-regions).   |
| `actions`                                                                      | `[{ name, label? }]`: standard actions, or custom ones listed by `label`.                                      |
| `onAction`                                                                     | Called with `{ actionName }` when one is performed.                                                            |

A **Pressable is one element**, read as its children's text, so it needs
something to read: give it a `label`, or text among its children. A
Pressable with neither (an icon alone) is a build error naming its line.

### Roles

| Role                                                                             | VoiceOver                      | TalkBack                                |
| -------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------- |
| `button`, `menuitem`, `radio`, `tab`, `combobox`                                 | Button                         | Button, RadioButton, or the role's name |
| `checkbox`, `switch`                                                             | Button, with the checked state | CheckBox, Switch                        |
| `heading`                                                                        | Heading (rotor)                | Heading                                 |
| `img`                                                                            | Image                          | ImageView                               |
| `link`                                                                           | Link                           | "link"                                  |
| `slider`, `spinbutton`                                                           | Adjustable (swipe up/down)     | SeekBar, "spin button" (scroll actions) |
| `searchbox`                                                                      | Search field                   | EditText                                |
| `tablist`                                                                        | Tab bar: tabs read "n of m"    | "tab list"                              |
| `progressbar`, `timer`                                                           | Updates frequently             | ProgressBar, "timer"                    |
| `summary`                                                                        | Summary                        | "summary"                               |
| `alert`, `grid`, `list`, `menu`, `menubar`, `radiogroup`, `scrollbar`, `toolbar` | No trait                       | The role's name                         |
| `none`, `presentation`                                                           | Nothing                        | Nothing                                 |

A role outside these is an error naming the supported ones. State becomes
what each reader has for it: `aria-disabled` dims the element,
`aria-selected` selects it, `aria-checked` is a checkable state on Android
and "checked" / "not checked" (or "on" / "off" for a switch) on iOS,
`aria-expanded` is an expand or collapse action on Android and "expanded" /
"collapsed" on iOS, and `aria-busy` is read as "busy". A range is a range on
Android and its current value on iOS; `aria-valuetext` wins over
`aria-valuenow` on both. Each fact is its own native prop, so changing one
updates only that one.

### Actions

`activate`, `increment`, `decrement` and `longpress` replace the reader's own
gestures: double tap, swipe up and down on an adjustable element on iOS, and
TalkBack's click, scroll forward and back, and long click. `magicTap` and
`escape` are VoiceOver gestures with no TalkBack equivalent and do nothing on
Android. Any other name is a custom action, in VoiceOver's actions rotor and
TalkBack's actions menu, under its `label`.

On iOS 16 the standard actions are custom actions too: UIKit's handlers for
them need iOS 17. For the same reason, an `accessible` container without a
label is read from its children on iOS 17 and later only; give it a `label`
for iOS 16. A Pressable reads its children on every version.

```tsx
import { HStack, Symbol, signal } from 'kuito';

const stars = signal(3);

function change(by: number) {
  stars.value = Math.min(5, Math.max(0, stars.value + by));
}

<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
  aria-valuetext={stars.value + ' of 5 stars'}
  actions={[{ name: 'increment' }, { name: 'decrement' }]}
  onAction={(event) => change(event.actionName === 'increment' ? 1 : -1)}
>
  <Symbol name="star.fill" />
</HStack>;
```

## The accessibility module

```tsx
import { Button, Text, VStack, accessibility, ref, signal, watch } from 'kuito';

export function Results() {
  const title = ref();
  const animations = signal(true);

  accessibility.screenReader.value; // true, false, or null until the platform answers
  watch(accessibility.reduceMotion, (calm) => {
    animations.value = !calm;
  });

  function found() {
    accessibility.announce('12 shows found');
    accessibility.announce('Saved', { queue: true });
    if (title.current) accessibility.focus(title.current);
  }

  return (
    <VStack>
      <Text ref={title} role="heading">
        Shows
      </Text>
      <Button onPress={found}>Search</Button>
    </VStack>
  );
}
```

- An announcement interrupts current speech; `queue: true` waits for it (iOS;
  TalkBack always queues).
- `focus` takes an element, such as `ref.current`.
- Screen reader status is VoiceOver on iOS and touch exploration (TalkBack) on
  Android. Reduce motion is the iOS setting and Android's Remove animations
  (an animator duration scale of 0).
- `screenReader` and `reduceMotion` are signals. The first read asks the
  native side once and is `null` until it answers; the answer and every later
  change update both, and a value that stays the same is no change.

## Live regions

`live` announces changes to a view's text: `polite` waits for current speech, `assertive` interrupts it. Android
has live regions natively. UIKit has none, so on iOS Kuito watches Text
inside the region and, once a batch of changes has applied, announces what
the region now reads.

```tsx
import { Text, signal } from 'kuito';

const status = signal('Uploading…');

<Text live="polite">{status.value}</Text>;
```

## How it crosses the boundary

Announcements, focus and the status request are commands in the mutation
queue, like `focus()` (see [keyboard](keyboard.md#how-it-crosses-the-boundary)).
Status arrives as the app's native event `accessibility.status` with
`{ screenReaderEnabled, reduceMotionEnabled }`; accessibility actions arrive
as `<id>.accessibilityaction` with `{ actionName }`.

On iOS, UIKit computes a label's or button's accessibility defaults only while
an assistive technology runs, so the renderer writes a property only when a
prop sets it, and restores what was there when the prop goes.
