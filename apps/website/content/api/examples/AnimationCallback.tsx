import { Box, motion, timing, type AnimationCallback } from 'kuito';

function Toast(props: { onHidden: () => void }) {
  const opacity = motion(1);
  // False when another animation interrupted it: the toast is still showing.
  const hidden: AnimationCallback = (finished) => finished && props.onHidden();

  opacity.value = timing({ duration: 300, delay: 2000, onEnd: hidden }).to(0);

  return <Box opacity={opacity} padding={12} />;
}
