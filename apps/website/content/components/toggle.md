# Toggle

`Toggle` is an on/off switch: a `UISwitch` on iOS, a `Switch` on Android. Given a signal as `checked`, it writes it as the user flips it.

Use it for:

- a setting that takes effect at once;
- turning a feature on or off in a list of settings;
- a choice the app saves when it changes.

```tsx
import { HStack, Text, Toggle, signal } from 'kuito';

export default function Downloads() {
  const wifiOnly = signal(true);

  return (
    <HStack gap={12} alignItems="center" padding={16}>
      <Text>Download on Wi-Fi only</Text>
      <Toggle label="Download on Wi-Fi only" checked={wifiOnly} />
    </HStack>
  );
}
```

## Patterns

### Save the choice when it changes

`onChange` receives the new `checked` value.

```tsx
import { Toggle, storage } from 'kuito';

export default function Autoplay() {
  return (
    <Toggle
      label="Autoplay"
      checked={storage.peek('autoplay') === 'on'}
      onChange={(on) => void storage.set('autoplay', on ? 'on' : 'off')}
    />
  );
}
```

### Disable it while another setting is off

```tsx
import { Toggle, VStack, signal } from 'kuito';

export default function Notifications() {
  const enabled = signal(true);
  const sounds = signal(true);

  return (
    <VStack gap={12}>
      <Toggle label="Notifications" checked={enabled} />
      <Toggle label="Sounds" checked={sounds} disabled={!enabled.value} />
    </VStack>
  );
}
```

## Platform differences

Each platform draws its own switch, with its own size and colors.

## Accessibility

A screen reader reads it as a switch, on or off. It has no text of its own: give it a `label`, the setting's name.

## Related

- [Switch](./switch.md), which is control flow, not a control
- [Two-way props](../../../../docs/events.md#two-way-props)
