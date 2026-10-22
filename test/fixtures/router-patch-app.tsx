import { Route, Router, Text, navigate } from 'kuito';

// Each evaluation of this module, a Live Patch's included, exposes its own navigate.
Object.assign(globalThis, { navigate });

function Home() {
  return <Text>home</Text>;
}

function About() {
  return <Text>about</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" />
      <Route name="about" path="/about" screen={About} title="About" />
    </Router>
  );
}
