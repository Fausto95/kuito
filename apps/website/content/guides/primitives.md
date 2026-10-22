# Primitives

Primitives are the views every screen is built from, each a real UIKit or Android view, named for what it lays out or does, with CSS names for its props.

**Use them for**

- Laying out a screen in columns and rows, with text, buttons and switches.
- Scrolling content clear of the notch and the home indicator.
- Sheets, pressable areas, images and the platform's symbols.

```tsx
import {
  Button,
  Divider,
  HStack,
  SafeArea,
  Scroll,
  Spacer,
  Spinner,
  Text,
  Toggle,
  VStack,
  signal,
} from 'kuito';

export default function Settings() {
  const wifiOnly = signal(true);
  const syncing = signal(false);

  return (
    <Scroll>
      <SafeArea edges={['top']} padding={16} gap={12}>
        <Text fontSize={28} fontWeight="bold">
          Settings
        </Text>
        <HStack alignItems="center" gap={8}>
          <Text>Download on Wi-Fi only</Text>
          <Spacer />
          <Toggle checked={wifiOnly} />
        </HStack>
        <Divider />
        <HStack alignItems="center" gap={8}>
          <Button disabled={syncing.value} onPress={() => (syncing.value = true)}>
            Sync now
          </Button>
          <Spinner animating={syncing.value} />
        </HStack>
      </SafeArea>
    </Scroll>
  );
}
```

| Primitive          | What it is                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `VStack`, `HStack` | A column or a row, with flexbox's `gap`, `alignItems`, `justifyContent`, `flexWrap`       |
| `Box`              | A container laid out like a VStack, for a surface or a shape: a card, a track, a swatch   |
| `Text`             | A string, wrapped over as many lines as it needs; its children are text, never elements   |
| `Button`           | The platform's button; its children are its title                                         |
| `Toggle`           | An on/off switch; `checked` is two-way when given a signal                                |
| `Spinner`          | The platform's progress indicator, spinning while `animating` (true by default)           |
| `Spacer`           | Takes the free space along its stack, pushing what follows to the end                     |
| `Divider`          | A line at least 1 point tall; in an HStack, give it `width={1}` and `alignSelf="stretch"` |
| `Fragment`         | Groups children with no view; `<>…</>`, or `<Fragment key>` in a list                     |

A VStack, HStack, Box or Spacer with only layout props (no handler, ref or animation) gets no native view of its own; its children join the nearest ancestor that has one ([flattening](../architecture.md#flattening)).

## Scroll a screen clear of the system bars

`SafeArea` is a VStack padded by the part of it the system covers: status bar, notch or Dynamic Island, home indicator, navigation bar. The app draws edge to edge, so backgrounds run under those areas while SafeArea keeps content clear; the inset adds to its own `padding`. `Scroll` scrolls its content, vertically or, with `horizontal`, across.

```tsx
import { SafeArea, Scroll, Text } from 'kuito';

export function Article() {
  return (
    <Scroll backgroundColor="#0b1020">
      <SafeArea edges={['top', 'bottom']} padding={20}>
        <Text color="#ffffff">A long article</Text>
      </SafeArea>
    </Scroll>
  );
}
```

A Scroll sends scroll events only while `onScroll` is set, and installs pull-to-refresh only while `onRefresh` is. For a long list, use [`List`](./lists.md): a vertical List inside a vertical Scroll renders every row.

## Show a bottom sheet

A native bottom sheet: `UISheetPresentationController` on iOS, Material's `BottomSheetDialog` on Android, with their gestures, backdrop and accessibility. `open` shows it; given a signal, the sheet sets it back to false when the user dismisses it.

```tsx
import { Button, Sheet, Text, VStack, signal } from 'kuito';

export function Queue() {
  const open = signal(false);

  return (
    <VStack>
      <Button onPress={() => (open.value = true)}>Up next</Button>
      <Sheet open={open} snapPoints={['content', '90%']} padding={24}>
        <Text>Three tracks queued</Text>
      </Sheet>
    </VStack>
  );
}
```

`snapPoints` are heights the sheet rests at, smallest first: points, a percentage, or `'content'`. `onClose` reports a dismissal, `onSnap` a new resting point. To present a whole screen as a sheet, use a route's [`presentation`](./navigation.md#present-a-screen-and-get-its-answer).

## Make an area pressable

`Pressable` is a container, laid out like VStack, that responds to touches. Its feedback (opacity, scale, haptics) runs natively on touch-down, without waiting for JavaScript. A press on a nested Pressable does not also press its parent.

```tsx
import { Pressable, Text, signal } from 'kuito';

export function Row() {
  const opened = signal(0);

  return (
    <Pressable
      onPress={() => opened.value++}
      onLongPress={() => (opened.value = 0)}
      pressedOpacity={0.7}
      pressedScale={0.97}
      haptic="light"
      padding={16}
    >
      <Text>Opened {opened.value} times</Text>
    </Pressable>
  );
}
```

A Pressable is one screen reader element, read as its children's text unless it has a `label`; one with neither is a build error ([Accessibility](./accessibility.md)).

## Show an image or a symbol

`Image` shows bundled images and `https`, `file` and `data:` URLs, cached. An image of a URL has no intrinsic size: give it `width` and `height`, or `aspectRatio`. An imported image is bundled into both shells, and its size is known when the app compiles. `Symbol` draws an SF Symbol on iOS and a Material Symbol on Android; a literal name a platform lacks is a compile error.

```tsx
import { HStack, Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

export function Cover() {
  return (
    <HStack gap={12} alignItems="center">
      <Image src={cover} />
      <Image
        src={{ uri: 'https://example.com/cover.jpg' }}
        aspectRatio={1.5}
        width={120}
        placeholder="#1e293b"
      />
      <Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
      <Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
    </HStack>
  );
}
```

## Lay out for right-to-left languages

In a right-to-left language an HStack's row runs right to left. Logical sides follow the direction: `paddingInlineStart`, `paddingInlineEnd`, `marginInlineStart`, `marginInlineEnd`, `insetInlineStart` and `insetInlineEnd` land on the right in Arabic or Hebrew and on the left in English.

```tsx
import { Divider, HStack, Symbol, Text, VStack } from 'kuito';

export function Contact() {
  return (
    <VStack>
      <HStack paddingInlineStart={16} paddingInlineEnd={8} gap={8} alignItems="center">
        <Symbol name="person" />
        <Text>Ada Lovelace</Text>
      </HStack>
      <Divider marginInlineStart={16} />
    </VStack>
  );
}
```

The root takes its direction from the user's first language; `direction="ltr"` or `"rtl"` forces one on a subtree. [Localization and RTL](./localization-rtl.md) covers what mirrors and what does not.

## Respect the user's text size

Text follows the user's text size: Dynamic Type on iOS, the font scale on Android. Buttons and text fields follow it too. `maxFontScale` on a `Text` caps how far it grows, as a factor of `fontSize`; a smaller user size still shrinks it.

```tsx
import { Text } from 'kuito';

export function TabLabel() {
  return (
    <Text fontSize={13} maxFontScale={1.5}>
      Library
    </Text>
  );
}
```

Cap text that sits in a fixed space, such as a tab label or a badge, and let body text grow.

## Related

- [Lists](./lists.md): long, virtualized lists
- [Keyboard](./keyboard.md): `TextField` and the software keyboard
- [Styles](../language/styles.md): classes, tokens and conditions
- [Primitives in depth](../../../../docs/primitives.md): every primitive's props, Image caching, the differences from React Native
