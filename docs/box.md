# Box

Create a general-purpose container. Use it for backgrounds, overlays, progress tracks and positioned content.

## Draw a progress track

```tsx
import { Box } from 'kuito';

export default function Progress() {
  return (
    <Box width={280} height={4} borderRadius={2} backgroundColor="#e5e7eb">
      <Box width="40%" height={4} borderRadius={2} backgroundColor="#e5484d" />
    </Box>
  );
}
```

## Behavior

Set explicit dimensions when a box has no content to size it. A percentage width is relative to the containing layout. Absolutely positioned children do not reserve room in normal layout.

## Continue

Read [Styles](styles.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Box#members) for types and documented defaults.
