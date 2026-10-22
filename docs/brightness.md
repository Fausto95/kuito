# brightness

The screen's brightness while the app is in front.

```tsx
import { Text, brightness } from 'kuito';

brightness.level.value = 1; // a QR code, a boarding pass
<Text>{`${brightness.level.value ?? '…'}`}</Text>;
await brightness.restore();
```

| Member      | Is                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `level`     | A writable signal, from 0 to 1: the app's level if it set one, otherwise the system's. `null` until the platform answers. |
| `system`    | A signal: whether the app hasn't set a level, or restored the system's. `null` until the platform answers.                |
| `restore()` | Hands brightness back to the system, then reads both signals again.                                                       |

Brightness is read on the main thread, so the signals start at `null` and the
first read asks the platform. Assigning `level` shows at once; a level
outside 0 to 1 throws a `RangeError` before anything crosses, and a write the
platform rejects goes through the error seam and reads the level again.

The level holds only while the app is in front, and a reload gives it back:

- iOS has one brightness for the whole device, so `UIScreen.brightness`
  outlives the app. The module keeps the system's level from before the first
  change, puts it back when the app goes to the background (through
  [`KuitoAppLifecycle`](app-state.md#how-it-is-wired)), and applies the
  app's level again when it returns.
- Android sets the window's `screenBrightness`, which the system already
  scopes to the activity.

The system-wide brightness (its mode, the `WRITE_SETTINGS` permission) isn't
there, and neither is a change event: `level` follows the app's own writes. The iOS simulator has no backlight: it ignores the level
and always reads 0.5. Try brightness on a device or the Android emulator.
