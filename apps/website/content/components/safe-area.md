# SafeArea

`SafeArea` is a VStack padded clear of what the system draws over it: the status bar, the notch or Dynamic Island, the home indicator, the navigation bar. The app draws edge to edge, so backgrounds run under those areas while a SafeArea keeps its content clear.

Use it for:

- a screen's content, kept out from under the status bar and the home indicator;
- a header whose background runs under the status bar;
- a bottom bar that clears the home indicator.

```tsx
import { SafeArea, Text } from 'kuito';

export default function Home() {
  return (
    <SafeArea flex={1} padding={16}>
      <Text fontSize={28} fontWeight="bold">
        Library
      </Text>
    </SafeArea>
  );
}
```

Only the overlap counts: a SafeArea in the middle of the screen gets no inset, and one at the bottom gets exactly the home indicator's height. The inset adds to its own `padding`, and follows rotation and changes of the system bars.

## Patterns

### Run a header's color under the status bar

`edges` picks the sides to pad, all four by default. The SafeArea's background fills the status bar's area while its text stays below it.

```tsx
import { SafeArea, Scroll, Text } from 'kuito';

export default function Feed() {
  return (
    <Scroll backgroundColor="#0b1020">
      <SafeArea edges={['top']} padding={20} backgroundColor="#1e293b">
        <Text color="#ffffff">Header</Text>
      </SafeArea>
    </Scroll>
  );
}
```

### Keep a bottom bar clear of the home indicator

```tsx
import { Button, SafeArea, Spacer, VStack } from 'kuito';

export default function Checkout() {
  return (
    <VStack flex={1}>
      <Spacer />
      <SafeArea edges={['bottom']} padding={16} backgroundColor="#f4f4f5">
        <Button onPress={() => console.log('pay')}>Pay</Button>
      </SafeArea>
    </VStack>
  );
}
```

## Platform differences

|        | iOS                                 | Android                    |
| ------ | ----------------------------------- | -------------------------- |
| Top    | Status bar, notch or Dynamic Island | Status bar, display cutout |
| Bottom | Home indicator                      | Navigation bar             |

A status bar that is not translucent on Android (`statusBar={{ translucent: false }}` on [SystemBars](./system-ui.md)) lays the app out below it, so a SafeArea there gets no top inset.

## Accessibility

A SafeArea is a container: a screen reader reads its children.

## Related

- [SystemBars](./system-ui.md)
- [Sheet](./sheet.md), whose content clears the same areas on its own
- [VStack](./vstack.md)
