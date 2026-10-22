// Animate a part of the splash screen.
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
