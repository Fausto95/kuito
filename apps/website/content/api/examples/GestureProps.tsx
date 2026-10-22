import { Box, tap, type GestureProps, type KuitoNode } from 'kuito';

// A card that takes the caller's gestures beside its own.
function Card(props: GestureProps & { onOpen: () => void; children: KuitoNode }) {
  return (
    <Box gestures={[tap({ onEnd: props.onOpen }), ...(props.gestures ?? [])]} padding={16}>
      {props.children}
    </Box>
  );
}
