// Prefer a long press and fall back to a tap.
import { Box, longPress, orElse, tap } from 'kuito';

export function PreviewCard() {
  const preview = longPress({ onStart: () => console.log('Preview') });
  const open = tap({
    onEnd: (_event, success) => {
      if (success) console.log('Open');
    },
  });
  return (
    <Box gestures={[orElse(preview, open)]} width={160} height={100} backgroundColor="#cbd5e1" />
  );
}
