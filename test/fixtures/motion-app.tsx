import { Box, Scroll, Text, motion, signal } from 'kuito';

export default function App() {
  const offset = motion(0);
  const label = signal('top');

  return (
    <Scroll
      id="feed"
      onScroll={(event) => {
        offset.value = event.y;

        if (event.y > 150) label.value = 'scrolled';
      }}
    >
      <Box id="header" opacity={1 - offset.value / 200} translateY={offset.value / -2} />
      <Text id="label">{label.value}</Text>
    </Scroll>
  );
}
