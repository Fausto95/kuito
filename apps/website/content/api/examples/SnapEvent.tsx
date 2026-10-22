// React when a sheet reaches a snap point.
import { Sheet, Text, signal, type SnapEvent } from 'kuito';

const snapPoints = ['content', '90%'] as const;
const expanded = signal(false);
const open = signal(true);

// index points into snapPoints: 1 is '90%'.
const settled = (event: SnapEvent) => (expanded.value = event.index === 1);

<Sheet
  open={open.value}
  snapPoints={snapPoints}
  onSnap={settled}
  onClose={() => (open.value = false)}
>
  <Text>{expanded.value ? 'All comments' : 'Top comments'}</Text>
</Sheet>;
