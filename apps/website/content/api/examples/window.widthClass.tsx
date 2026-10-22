import { Show, Text, window } from 'kuito';

window.widthClass.value; // 'compact', 'medium' or 'expanded'

<Show when={window.widthClass.value === 'expanded'}>
  <Text>Two panes</Text>
</Show>;
