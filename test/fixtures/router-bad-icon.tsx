import { Route, Router, Tab, Tabs, Text } from 'kuito';

function Home() {
  return <Text>home</Text>;
}

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="home" title="Home" icon={{ web: 'house' } as never}>
          <Route name="index" path="/" screen={Home} />
        </Tab>
      </Tabs>
    </Router>
  );
}
