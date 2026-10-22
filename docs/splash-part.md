# SplashPart

Render an individual part of the configured splash artwork. Use it for custom launch transitions with separate logo and brand motion.

## Render the launch logo separately

```tsx
import { Box, SplashPart, timing } from 'kuito';

<Box position="absolute" left={0} top={0} right={0} bottom={0}>
  <SplashPart part="background" position="absolute" left={0} top={0} right={0} bottom={0} />
  <SplashPart
    part="logo"
    left={120}
    top={300}
    width={160}
    height={160}
    opacity={timing(400).to(0)}
  />
</Box>;
```

## Behavior

SplashPart uses the native splash layout and artwork. Use it inside a custom handoff when the logo and background need different animations. Configure the artwork before rendering the part.

## Continue

Read [Splash](splash.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/SplashPart#members) for types and documented defaults.
