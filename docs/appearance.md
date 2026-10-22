# Follow light mode and text size

Read the system color scheme and font scale. Use these signals when JavaScript behavior must follow appearance; use CSS media queries for most visual styling.

## Read appearance preferences

```tsx
import { Text, watch, appearance } from 'kuito';

appearance.colorScheme.value; // 'light' | 'dark' | null
appearance.fontScale.value; // 1 by default

// In a component, a read in JSX or a watch follows the platform.
<Text>{appearance.colorScheme.value === 'dark' ? 'Night' : 'Day'}</Text>;
watch(appearance.fontScale, (scale) => console.log(scale));
```

## Behavior and limits

`appearance.colorScheme` and `appearance.fontScale` are read-only signals. Read them inside JSX or watch callbacks to follow changes. Font scaling is already applied by native text; do not multiply every font size again. Use `@media (prefers-color-scheme: dark)` for theme tokens and rules.

## Continue

Read [Styles](styles.md) for the related workflow. The API reference lists every method, option, event and return type.
