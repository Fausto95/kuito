// Track raw touch movement over a drawing surface.
import { Box, touches } from 'kuito';

export function TouchSurface() {
  const input = touches({ onChange: (event) => console.log(event.changeX, event.changeY) });
  return <Box gestures={[input]} width={240} height={240} backgroundColor="#e2e8f0" />;
}
