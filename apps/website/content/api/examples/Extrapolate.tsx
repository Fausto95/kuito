// Choose behavior beyond interpolation stops.
import { Box, Scroll, interpolate, scrollMotion, type Extrapolate } from 'kuito';

function Header(props: { parallax: boolean }) {
  const feed = scrollMotion();
  // 'extend' keeps the image moving past 200 points; 'clamp' (the default) stops it there.
  const extrapolate: Extrapolate = props.parallax ? 'extend' : 'clamp';

  return (
    <Scroll motion={feed}>
      <Box
        height={240}
        translateY={interpolate(feed.offset, [0, 200], [0, 100], { extrapolate })}
      />
    </Scroll>
  );
}
