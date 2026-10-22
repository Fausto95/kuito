# Adapt to the window

Read the current window size, insets, orientation and width class. Use these signals for behavior that depends on available space.

## Read the current viewport

```tsx
import { Text, window } from 'kuito';

<Text>{`${window.size.value.width} × ${window.size.value.height}`}</Text>;
<Text>{window.orientation.value === 'landscape' ? 'Wide' : 'Tall'}</Text>;
window.insets.value; // { top, left, bottom, right }
```

## Behavior and limits

Window size is the app viewport, not necessarily the physical display. Multi-window and rotation can change it. Read signals in JSX or watch callbacks to stay current. Use CSS width-class queries for layout and SafeArea for inset padding before calculating equivalent values manually.

## Continue

Read [Styles](styles.md) for the related workflow. The API reference lists every method, option, event and return type.
