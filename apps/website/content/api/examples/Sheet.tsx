// Open and dismiss a sheet with a signal.
import { Sheet, Text, signal } from 'kuito';

const queueOpen = signal(false);

<Sheet
  open={queueOpen.value}
  snapPoints={['content', '90%']}
  onClose={() => (queueOpen.value = false)}
  padding={24}
>
  <Text>Up next</Text>
</Sheet>;
