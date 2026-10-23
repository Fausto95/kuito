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

## Continue

Read [Keyboard](keyboard.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Scroll#members) for types and documented defaults.
