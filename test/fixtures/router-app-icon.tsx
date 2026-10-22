// router-app.tsx after a Live Patch that only changed LIBRARY_ICON.
import {
  Link,
  Route,
  Router,
  Tab,
  Tabs,
  Text,
  Pressable,
  goBack,
  signal,
  routes,
  type ScreenProps,
} from 'kuito';

function Home() {
  const visits = signal(0);

  return (
    <Pressable id="home-visit" onPress={() => visits.value++}>
      <Text id="home-visits">{`${visits.value} visits`}</Text>
      <Link id="to-show" to={routes.show({ id: 42 })}>
        <Text>Open</Text>
      </Link>
      <Link id="to-settings" to={routes.settings()}>
        <Text>Settings</Text>
      </Link>
    </Pressable>
  );
}

function ShowScreen({ id }: ScreenProps<{ id: number }>) {
  return (
    <Pressable id="show-back" onPress={() => goBack()}>
      <Text id="show-id">{`show ${id}`}</Text>
    </Pressable>
  );
}

function Library() {
  return <Text id="library">library</Text>;
}

const LIBRARY_ICON = { uri: 'https://example.com/shelf.png' };

function Settings() {
  return <Text id="settings">settings</Text>;
}

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="home" title="Home" icon={{ ios: 'house', android: 'home' }}>
          <Route name="index" path="/" screen={Home} title="Home" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={ShowScreen}
            title={({ id }) => `Show ${id}`}
          />
        </Tab>
        <Tab name="library" title="Library" icon={LIBRARY_ICON}>
          <Route name="library" path="/library" screen={Library} title="Library" header={false} />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
