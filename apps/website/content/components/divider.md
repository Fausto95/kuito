# Divider

`Divider` is a thin line between views: at least 1 point tall, in the system's separator color on iOS and light gray on Android.

Use it for:

- separating the rows of a settings screen;
- a line under a header;
- a vertical rule between items of a row.

```tsx
import { Divider, Text, VStack } from 'kuito';

export default function Settings() {
  return (
    <VStack>
      <Text padding={16}>Account</Text>
      <Divider />
      <Text padding={16}>Notifications</Text>
    </VStack>
  );
}
```

## Patterns

### Inset it under a row's text

A logical margin keeps the inset on the reading side in a right-to-left language.

```tsx
import { Divider, Text, VStack } from 'kuito';

export default function Account() {
  return (
    <VStack>
      <Text padding={16}>Email</Text>
      <Divider marginInlineStart={16} />
      <Text padding={16}>Password</Text>
    </VStack>
  );
}
```

### Draw a vertical rule

In an HStack it has no width, and the row centers it: give it `width={1}` and `alignSelf="stretch"` to run the row's height.

```tsx
import { Divider, HStack, Text } from 'kuito';

export default function Duration() {
  return (
    <HStack gap={8} height={20} alignItems="center">
      <Text>3:42</Text>
      <Divider width={1} alignSelf="stretch" />
      <Text>Ada Ray</Text>
    </HStack>
  );
}
```

### Change its color

```tsx
import { Divider } from 'kuito';

export default function Rule() {
  return <Divider backgroundColor="#e5484d" />;
}
```

## Platform differences

|               | iOS                          | Android                        |
| ------------- | ---------------------------- | ------------------------------ |
| Default color | The system's separator color | Light gray, whatever the theme |

## Accessibility

A screen reader skips it: it has nothing to read.

## Related

- [Spacer](./spacer.md)
- [List](./list.md), whose `separator` takes a Divider
