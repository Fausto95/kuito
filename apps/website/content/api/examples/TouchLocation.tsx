import { Pressable, Text, signal, type TouchLocation } from 'kuito';

const lastTouch = signal<TouchLocation | null>(null);

// Where the press started, in the view and on screen, for a popover to point at.
<Pressable
  onPressStart={(event) => (lastTouch.value = event)}
  onPress={() => console.log(lastTouch.value?.pageY)}
>
  <Text>Share</Text>
</Pressable>;
