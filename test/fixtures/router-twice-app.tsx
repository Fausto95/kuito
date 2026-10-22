import { Route, Router, Text } from 'kuito';

function Home() {
  return <Text>home</Text>;
}

export default function App() {
  return (
    <>
      <Router>
        <Route name="index" path="/" screen={Home} />
      </Router>
      <Router>
        <Route name="index" path="/" screen={Home} />
      </Router>
    </>
  );
}
