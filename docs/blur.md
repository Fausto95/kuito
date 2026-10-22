# Blur

What is behind a view, blurred and tinted, under its children: a frosted
bar, a sheet's header, a card over a photo. UIVisualEffectView on iOS; on
Android the view draws its backdrop itself.

```tsx
import { Blur, Image, Text, VStack } from 'kuito';

export function NowPlaying(props: { cover: string }) {
  return (
    <VStack flex={1}>
      <Image src={props.cover} position="absolute" top={0} right={0} bottom={0} left={0} />
      <Blur material="thin" position="absolute" bottom={0} left={0} right={0} padding={16}>
        <Text>Now playing</Text>
      </Blur>
    </VStack>
  );
}
```

A `Blur` is a [native view](native-modules.md#views) that takes children: it
lays them out inside it as a `Box` does, above the blur, and is as large as
they are unless its style sizes it. It takes style, layout and
accessibility props. Its module is linked only into apps that import it.

## Props

| Prop       | Default   | Notes                                               |
| ---------- | --------- | --------------------------------------------------- |
| `material` | `regular` | `ultraThin`, `thin`, `regular`, `thick` or `chrome` |

The materials are Apple's system materials, from the most see-through to
the one bars are made of. Each follows the color scheme: light in light
mode, dark in dark mode. A material it doesn't have fails as the prop's
`unsupportedValue` error. There is no blur radius: UIKit gives none, so a
radius would mean something on Android alone.

## Platforms

- **iOS** shows UIKit's material (`systemThinMaterial` for `thin`, and so
  on) in a visual effect view that fills the Blur, under its children.
- **Android** blurs a view's own drawing, never what is behind it. Before
  each frame the Blur draws the views behind it (the ones an ancestor draws
  before the branch the Blur is in) into a RenderNode that a RenderEffect
  blurs, then its material's tint over it (Android 12 and later). Views
  above the Blur, and its own children, are not in its backdrop. The radius
  and tint of each material are picked by eye against iOS; compare both on
  a device before tuning one.
- **Android before 12** has no RenderEffect: the Blur draws its material's
  tint alone, near opaque so what is above it stays legible.

What Android's backdrop leaves out: a view behind it with a scale or a
rotation is drawn with them, but a scale or rotation of the Blur's own
ancestors, a clip, an elevation shadow or a SurfaceView (video, the camera
preview) behind it is not in the blur.

## Tests

On the [headless host](testing.md) a Blur is a container: its children are
laid out and queried as a Box's. The blur itself is not drawn.
