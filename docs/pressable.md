# Pressable

Make custom content respond to presses. Use it for cards, icon buttons and actions with a custom appearance.

## Give a custom action pressed feedback

```tsx
import { Pressable, Text } from 'kuito';

export default function Open() {
  return (
    <Pressable
      onPress={() => console.log('open')}
      pressedOpacity={0.7}
      pressedScale={0.97}
      haptic="light"
      padding={16}
    >
      <Text>Open</Text>
    </Pressable>
  );
}
```

## Behavior

`pressedOpacity` and `pressedScale` provide visual feedback; `haptic` adds a native touch response. Use `onPress` for the completed action, and start/end callbacks for press tracking. Give icon-only actions an accessible label.

## Props

<!-- Pressable props: generated from src/protocol/manifest.ts -->

| Prop                          | Meaning                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `onPress`                     | A completed press. Not called when a long press fired.    |
| `onPressStart` / `onPressEnd` | Touch down / up or cancel.                                |
| `onLongPress`                 | Held for `longPressDuration` ms (500 by default).         |
| `disabled`                    | Ignores touches.                                          |
| `hitArea`                     | Extra touchable margin in points.                         |
| `pressedOpacity` _(Kuito)_    | Opacity while pressed, like `TouchableOpacity`. 1 = none. |
| `pressedScale` _(Kuito)_      | Scale while pressed, e.g. `0.97`. 1 = none.               |
| `haptic` _(Kuito)_            | `light`, `medium`, `heavy` or `selection` on press-in.    |

<!-- end of generated props -->

## Continue

Read [Accessibility](accessibility.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Pressable#members) for types and documented defaults.
