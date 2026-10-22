// Switch layout at a window width class.
import { Show, Text, VStack, window, type WidthClass } from 'kuito';

const twoPanes = (width: WidthClass) => width !== 'compact';

<Show when={twoPanes(window.widthClass.value)} fallback={<Text>List</Text>}>
  <VStack flexDirection="row">
    <Text>List</Text>
    <Text>Detail</Text>
  </VStack>
</Show>;
