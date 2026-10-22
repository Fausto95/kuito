# haptics

Haptic feedback the user feels: `UIFeedbackGenerator` on iOS, the window's
view haptics on Android.

Use it for:

- the tick of a custom picker or stepper changing value;
- a tap when a dragged card snaps into place or a pull crosses its threshold;
- confirming that a save succeeded, or that it failed.

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

For feedback on press-in alone, a [`Pressable`](primitives.md#pressable)'s
`haptic` prop (`light`, `medium`, `heavy` or `selection`) plays it natively
on touch-down, with no call.

## API

| Member                       | Returns         | Plays                                                       |
| ---------------------------- | --------------- | ----------------------------------------------------------- |
| `haptics.supported`          | `boolean`       | Nothing. Whether the device has haptic hardware.            |
| `haptics.selection()`        | `Promise<void>` | The tick of a picker or a segmented control changing value. |
| `haptics.impact(style)`      | `Promise<void>` | A collision of a UI element: `style` is an `ImpactStyle`.   |
| `haptics.notification(type)` | `Promise<void>` | The outcome of a task: `type` is a `NotificationType`.      |

`ImpactStyle` is `'light' | 'medium' | 'heavy'` and `NotificationType` is
`'success' | 'warning' | 'error'`; both types are exported from `kuito`.

`supported` is a fixed fact, read once when the app starts. Simulators and
emulators report `false`. Playing feedback on a device without haptics, or
with touch feedback turned off on Android, does nothing and still resolves.

The three functions run on the main thread and resolve once the feedback is
handed to the system. Called from code the compiler places on the UI thread,
such as a scroll or gesture handler, they play in the same frame, without a
round trip through JavaScript ([UI-thread
calls](native-modules.md#calls-from-ui-thread-code)). A `style` or `type`
outside its union rejects with `ERR_ARGUMENT` before anything reaches the
platform ([errors](native-modules.md#errors)).

## Platforms

| Call                      | iOS                                           | Android (`HapticFeedbackConstants`)      |
| ------------------------- | --------------------------------------------- | ---------------------------------------- |
| `supported`               | `CHHapticEngine` hardware capabilities        | the default `Vibrator`'s `hasVibrator()` |
| `selection()`             | `UISelectionFeedbackGenerator`                | `CLOCK_TICK`                             |
| `impact('light')`         | `UIImpactFeedbackGenerator`, `.light`         | `VIRTUAL_KEY`                            |
| `impact('medium')`        | `UIImpactFeedbackGenerator`, `.medium`        | `CONTEXT_CLICK`                          |
| `impact('heavy')`         | `UIImpactFeedbackGenerator`, `.heavy`         | `LONG_PRESS`                             |
| `notification('success')` | `UINotificationFeedbackGenerator`, `.success` | `CONFIRM`, `CONTEXT_CLICK` before API 30 |
| `notification('warning')` | `UINotificationFeedbackGenerator`, `.warning` | `LONG_PRESS`                             |
| `notification('error')`   | `UINotificationFeedbackGenerator`, `.error`   | `REJECT`, `LONG_PRESS` before API 30     |

Android plays view haptics on the activity's window, so it needs no
`VIBRATE` permission and follows the system's touch feedback setting. Its
patterns are coarser than iOS's: `warning` and `heavy` feel the same. On
iOS the shell links `CoreHaptics`; no `kuito.config.ts` entry is needed on
either platform.

## Tests

The [test host](testing.md#native-modules) fakes the module by its spec's
name, `Haptics`. `selection`, `impact` and `notification` return nothing, so
they do nothing unless faked; fake `Haptics: { isSupported: () => true }`
to read `supported`.

## Related

- [Native modules](native-modules.md): how `haptics` is declared and linked.
- [Pressable](primitives.md#pressable): the `haptic` prop.
- [Placement](placement.md): why a handler that only plays haptics runs on
  the UI thread.
- [clipboard](clipboard.md): a copy that pairs with a `success` notification.
