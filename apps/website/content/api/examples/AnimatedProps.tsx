import { Pressable, Text, signal, spring, timing, type AnimatedProps } from 'kuito';

const selected = signal(false);

const look = (on: boolean): AnimatedProps => ({
  opacity: on ? 1 : 0.6,
  scale: on ? 1 : 0.96,
  backgroundColor: on ? '#0a84ff' : '#e5e5ea',
});

<Pressable
  animate={look(selected.value)}
  transition={{
    opacity: timing(200),
    transform: spring({ damping: 14 }),
    backgroundColor: timing(200),
  }}
  onPress={() => (selected.value = !selected.value)}
>
  <Text>Follow</Text>
</Pressable>;
