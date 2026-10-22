# Read Kuito APIs

Kuito uses consistent names for views, state and actions. Use these conventions to find an unfamiliar feature and recognize how its value changes.

## Choose an import

| Import         | Use it for                                            |
| -------------- | ----------------------------------------------------- |
| `kuito`        | App components, state, motion and device capabilities |
| `kuito/config` | App configuration types and configuration tooling     |
| `kuito/tests`  | Headless screen tests and platform fakes              |

Components begin with a capital letter (`Text`, `List`, `Camera`). Capability namespaces use lower camel case (`fileSystem`, `secureStore`, `notifications`). Standalone actions such as `alert` and `share` are functions.

## Recognize state and actions

```tsx
import { Text, Toggle, VStack, appearance, keepAwake, signal } from 'kuito';

export function ReaderSettings() {
  keepAwake();
  const largeText = signal(false);

  return (
    <VStack padding={16} gap={12}>
      <Toggle label="Larger text" checked={largeText} />
      <Text fontSize={largeText.value ? 24 : 16}>
        {appearance.colorScheme.value === 'dark' ? 'Dark appearance' : 'Light appearance'}
      </Text>
    </VStack>
  );
}
```

A signal exposes `.value`; JSX tracks reads so the UI follows changes. Bind a writable signal directly to a supported control prop such as `checked` or `value` for two-way updates. Fixed device facts are ordinary properties. Actions use verbs, such as `notifications.schedule` or `fileSystem.read`, and asynchronous actions return promises without an `Async` suffix.

Resources such as `keepAwake()` and `audio.player()` belong to the component that creates them during setup. They do not use a `use` prefix. Outside component setup, resource APIs that support it require an explicit app scope. See [lifetime and cleanup](lifecycle-events.md).

## Recognize props and events

Layout and paint props follow CSS names in camel case: `backgroundColor`, `paddingInlineStart`, `fontSize`. Child-content slots are nouns such as `header`, `footer` and `empty`. Related options are grouped, for example `keyboard={{ avoid: 'padding' }}`.

Element handlers begin with `on`: `onPress`, `onSubmit`, `onReachEnd`. A value-change handler often receives the value directly (`TextField.onChange` receives a string); other events receive structured payloads. Check the specific prop signature instead of assuming every handler receives a DOM-style event.

Use `watch(signal, callback)` for reactive state. Some device namespaces also provide named events, such as `app.watch('memoryWarning', callback)`. The namespace reference lists the supported event names.

## Read types and units

A component's props use its name plus `Props`, such as `ButtonProps`. Functions expose named options and result types where useful. Their reference examples show either direct typed usage or the consuming API.

Native numeric layout values are points. APIs document their own units: location distances are meters, many timers use milliseconds, and media playback positions use seconds. Consult the field description before passing a duration or coordinate.

Continue with [state](reactivity.md), [events](events.md), [styles](styles.md) or [the API reference](https://kuito.dev/docs/apis).
