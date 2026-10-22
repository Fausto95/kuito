# SystemBars

Set system bar appearance while a view is active. Use it for a dark gallery or a screen that draws behind system UI.

## Use light system controls over a dark screen

```tsx
import { SystemBars, Text, VStack } from 'kuito';

export default function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#101014"
        navigationBarButtonStyle="light"
      />
      <VStack flex={1} backgroundColor="#101014">
        <Text color="#ffffff">Photos</Text>
      </VStack>
    </>
  );
}
```

## Behavior

Status bar content style names the foreground color. Use SafeArea for content spacing; SystemBars sets appearance. Android navigation bar settings apply to its system navigation controls.

## Continue

Read [Window](window.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/SystemBars#members) for types and documented defaults.
