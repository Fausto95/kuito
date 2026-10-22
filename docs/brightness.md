# Adjust screen brightness

Set app-scoped screen brightness for a reader, scanner or presentation, then restore the system setting when that mode ends.

## Temporarily change brightness

```tsx
import { Text, brightness } from 'kuito';

brightness.level.value = 1; // a QR code, a boarding pass
<Text>{`${brightness.level.value ?? '…'}`}</Text>;
await brightness.restore();
```

## Behavior and limits

`brightness.level` is writable and uses the range 0–1. `brightness.system` reports the system value. Call `restore()` when the temporary mode ends; use lifecycle cleanup when a screen owns the change. A brightness override is different from keeping the screen awake.

## Continue

Read [Keep awake](keep-awake.md) for the related workflow. The API reference lists every method, option, event and return type.
