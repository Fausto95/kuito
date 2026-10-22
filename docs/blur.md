# Blur

Place content over a native blurred backdrop. Use it for a floating toolbar or a caption over artwork.

## Overlay a now-playing caption

```tsx
import { Blur, Image, Text, VStack } from 'kuito';

export default function NowPlaying() {
  return (
    <VStack flex={1}>
      <Image
        src="https://example.com/cover.jpg"
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
      />
      <Blur material="thin" position="absolute" bottom={0} left={0} right={0} padding={16}>
        <Text>Now playing</Text>
      </Blur>
    </VStack>
  );
}
```

## Behavior

A blur needs visible content behind it. `material` chooses the native blur treatment, so appearance varies by platform. Keep foreground text readable and do not rely on blur alone for contrast.

## Continue

Read [Styles](styles.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Blur#members) for types and documented defaults.
