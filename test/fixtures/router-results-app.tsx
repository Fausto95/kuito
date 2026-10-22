import { Pressable, Route, Router, Text, present, routes, signal, type ScreenProps } from 'kuito';

function Home() {
  // How often Home renders: the test reads it from the app's global.
  const host = globalThis as { homeRenders?: number };

  host.homeRenders = (host.homeRenders ?? 0) + 1;

  const picked = signal('nothing');
  const rated = signal('unrated');

  const pick = async () => {
    const color = await present(routes.picker({ from: 'home' }));

    picked.value = color ?? 'none';
  };

  const rate = async () => {
    const stars = await present(routes.details());

    rated.value = stars === undefined ? 'skipped' : `${stars} stars`;
  };

  return (
    <>
      <Pressable id="pick" onPress={() => void pick()}>
        <Text id="picked">{picked.value}</Text>
      </Pressable>
      <Pressable id="rate" onPress={() => void rate()}>
        <Text id="rated">{rated.value}</Text>
      </Pressable>
    </>
  );
}

function Picker({ from, dismiss }: ScreenProps<{ from: string }, string>) {
  return (
    <Pressable id="choose" onPress={() => dismiss('red')}>
      <Text id="picker-from">{`from ${from}`}</Text>
    </Pressable>
  );
}

function Details({ dismiss }: ScreenProps<{}, number>) {
  return (
    <Pressable id="five" onPress={() => dismiss(5)}>
      <Text>Five stars</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" backgroundColor="#08080b" />
      <Route name="details" path="/details" screen={Details} title="Details" />
      <Route
        name="picker"
        path="/picker"
        screen={Picker}
        presentation="sheet"
        snapPoints={['40%', '100%']}
      />
    </Router>
  );
}
