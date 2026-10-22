import { Box, Link, Route, Router, Text, interpolate, routes, type ScreenProps } from 'kuito';

function Home({ back }: ScreenProps) {
  return (
    <Box id="home" opacity={back ? interpolate(back, [0, 1], [1, 0.5]) : 1}>
      <Link id="to-show" to={routes.next()}>
        <Text>Open</Text>
      </Link>
      <Link id="to-details" to={routes.details()}>
        <Text>Details</Text>
      </Link>
    </Box>
  );
}

function Show({ back }: ScreenProps) {
  return <Box id="show" translateX={back ? interpolate(back, [0, 1], [0, 100]) : 0} />;
}

function Details({ sheet }: ScreenProps) {
  return (
    <Box
      id="details"
      opacity={sheet ? sheet.progress : 1}
      translateY={sheet ? interpolate(sheet.height, [0, 1000], [0, -100]) : 0}
    />
  );
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" />
      <Route name="next" path="/next" screen={Show} title="Next" />
      <Route
        name="details"
        path="/details"
        screen={Details}
        presentation="sheet"
        snapPoints={['50%', '100%']}
      />
    </Router>
  );
}
