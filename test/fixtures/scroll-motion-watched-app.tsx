import { Box, Scroll, scrollMotion } from 'kuito';

export default function App() {
  const feed = scrollMotion();
  // A Map cannot cross to the UI thread: the prop runs on the JS thread and watches the offset.
  const factor = new Map([['scale', 0.01]]);

  return (
    <Scroll id="feed" motion={feed}>
      <Box id="header" scale={1 + feed.offset.value * Number(factor.get('scale'))} />
      <Box height={2000} />
    </Scroll>
  );
}
