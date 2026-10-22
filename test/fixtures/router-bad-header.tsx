import { Route, Router, Text } from 'kuito';

function Shows() {
  return <Text>shows</Text>;
}

export default function App() {
  return (
    <Router>
      <Route
        name="index"
        path="/"
        screen={Shows}
        header={{ trailing: [{ icon: 'plus', onPress: () => {} } as never] }}
      />
    </Router>
  );
}
