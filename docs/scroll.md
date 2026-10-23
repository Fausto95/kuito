# Scroll

Scroll a page whose children can all stay mounted. Use it for an article, form or a small set of sections.

## Read a page of paragraphs

```tsx
import { Scroll, Text } from 'kuito';

const paragraphs = ['The tide came in.', 'It went out again.', 'Nobody noticed.'];

export default function Article() {
  return (
    <Scroll flex={1} padding={16} gap={12}>
      {paragraphs.map((paragraph) => (
        <Text key={paragraph}>{paragraph}</Text>
      ))}
    </Scroll>
  );
}
```

## Behavior

Give the scroll view a bounded height, often with `flex={1}`. All children are rendered. Use List for large collections. Vertical scroll views can keep focused fields clear of the keyboard.

## Props

<!-- Scroll props: generated from src/protocol/manifest.ts -->

| Prop                              | Meaning                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `horizontal`                      | Scroll sideways. Changing it remounts the view.                                                                                                                                                                                |
| `onScroll`, `scrollInterval`      | `{ x, y, contentWidth, contentHeight, layoutWidth, layoutHeight }` in points, at most once per throttle (50 ms by default).                                                                                                    |
| `onScrollEnd`                     | HTML's `scrollend`: the same fields, where it came to rest after a fling, a drag or a `scrollTo`, once per rest.                                                                                                               |
| `onReachEnd`, `reachEndThreshold` | Once each time the end comes within the threshold, in visible lengths (0.5 by default).                                                                                                                                        |
| `onRefresh`, `refreshing`         | Pull-to-refresh (vertical only).                                                                                                                                                                                               |
| `scrollbar`                       | Shows or hides the scrollbar.                                                                                                                                                                                                  |
| `motion`                          | `scrollMotion()`: its `offset`, `velocity` and `overscroll` move with the view every frame, on the UI thread ([follow scrolling](motion.md#follow-scrolling)).                                                                 |
| `paging`, `snapOffsets`           | Where a drag comes to rest: whole pages, or the offsets given.                                                                                                                                                                 |
| `keyboard`                        | `{ dismiss, persistTaps, inset, avoid }`: when dragging dismisses the keyboard, what a tap outside the field does, whether content stays clear of it (true by default) ([keyboard](keyboard.md#keep-a-focused-field-visible)). |

<!-- end of generated props -->

## Continue

Read [Keyboard](keyboard.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Scroll#members) for types and documented defaults.
