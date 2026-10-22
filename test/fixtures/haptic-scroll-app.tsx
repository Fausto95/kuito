import { Box, Scroll, haptics, motion } from 'kuito';

export default function App() {
  const offset = motion(0);

  return (
    <Scroll
      id="feed"
      onScroll={(event) => {
        offset.value = event.y;

        if (event.y > 100) void haptics.impact('light');
      }}
    >
      <Box id="header" opacity={1 - offset.value / 200} />
    </Scroll>
  );
}
