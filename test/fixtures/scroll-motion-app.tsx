import { Box, List, Scroll, Text, interpolate, scrollMotion } from 'kuito';

const POSTERS = Array.from({ length: 40 }, (_, index) => ({ id: 'poster-' + index }));

export default function App() {
  const feed = scrollMotion();
  const rail = scrollMotion();

  return (
    <Scroll id="feed" motion={feed}>
      <Box
        id="header"
        height={120}
        translateY={feed.offset.map((offset) => offset / -2)}
        opacity={interpolate(feed.offset, [0, 200], [1, 0])}
        scale={feed.overscroll.map((pulled) => 1 - pulled / 100)}
      />
      <Box id="speed" opacity={interpolate(feed.velocity, [0, 1000], [1, 0])} />
      <Box id="poster" translateX={rail.offset.map((offset) => offset / -4)} />
      <List
        id="rail"
        horizontal
        height={200}
        motion={rail}
        data={POSTERS}
        itemKey={(poster) => poster.id}
        renderItem={({ item }) => <Text width={120}>{item.id}</Text>}
      />
      <Box height={2000} />
    </Scroll>
  );
}
