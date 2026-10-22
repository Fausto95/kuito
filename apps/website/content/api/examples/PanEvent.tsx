import { Box, motion, pan, spring, type PanEvent } from 'kuito';

function Dismissible(props: { onDismiss: () => void }) {
  const drag = pan({ axis: 'y' }).release(spring());
  const y = motion(0).follows(drag.y);

  // Far enough, or thrown fast enough: dismiss instead of springing back.
  const decide = (event: PanEvent, success: boolean) => {
    if (success && (event.translationY > 160 || event.velocityY > 800)) props.onDismiss();
  };

  return <Box translateY={y} gestures={[pan({ axis: 'y', onEnd: decide }), drag]} height={300} />;
}
