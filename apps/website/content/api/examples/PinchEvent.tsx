import { Image, motion, pinch, spring, type PinchEvent } from 'kuito';

function Zoomable() {
  const zoom = pinch().release(spring());
  const scale = motion(1).follows(zoom.scale);

  const report = (event: PinchEvent) => console.log(`zoomed to ${event.scale.toFixed(1)}x`);

  return (
    <Image
      src="https://example.com/map.png"
      width={300}
      height={300}
      scale={scale}
      gestures={[pinch({ onEnd: report }), zoom]}
    />
  );
}
