import { Box, Link, Route, Router, Text, VStack, routes, type ScreenProps } from 'kuito';

function Home() {
  return (
    <Link id="to-show" to={routes.show({ id: 7 })}>
      {/* Layout alone would flatten a VStack; its sharedId needs the native view. */}
      <VStack id="poster-small" sharedId="poster-7" width={60} height={90} />
    </Link>
  );
}

function ShowScreen({ id }: ScreenProps<{ id: number }>) {
  return (
    <>
      <Box
        id="poster-large"
        sharedId={`poster-${id}`}
        width={240}
        height={360}
        backgroundColor="#e50914"
      />
      <Text>{`show ${id}`}</Text>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" />
      <Route name="show" path="/show/:id" params={{ id: Number }} screen={ShowScreen} />
    </Router>
  );
}
