import { Route, Router, Tab, Tabs, Text, type ScreenProps } from 'kuito';

function Home() {
  return <Text id="home">home</Text>;
}

function ShowScreen({ id }: ScreenProps<{ id: number }>) {
  return <Text id="show-id">{`show ${id}`}</Text>;
}

function Library() {
  return <Text id="library">library</Text>;
}

function Settings() {
  return <Text id="settings">settings</Text>;
}

export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="home" title="Home">
          <Route name="index" path="/" screen={Home} title="Home" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={ShowScreen}
            title={({ id }) => `Show ${id}`}
          />
        </Tab>
        <Tab name="library" title="Library">
          <Route name="library" path="/library" screen={Library} title="Library" />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
