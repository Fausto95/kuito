# Tabs

Create a native tab bar with an independent stack for each tab. Use it for the main destinations of an app.

## Keep Discover and Library in separate tabs

```tsx
import { Route, Router, Tab, Tabs, Text } from 'kuito';

function Discover() {
  return <Text padding={16}>Discover</Text>;
}

function Library() {
  return <Text padding={16}>Library</Text>;
}

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="discover" title="Discover" icon={{ ios: 'safari', android: 'explore' }}>
          <Route name="index" path="/" screen={Discover} title="Discover" />
        </Tab>
        <Tab
          name="library"
          title="Library"
          icon={{ ios: 'books.vertical', android: 'library_music' }}
        >
          <Route name="library" path="/library" screen={Library} title="Library" />
        </Tab>
      </Tabs>
    </Router>
  );
}
```

## Behavior

Tabs belongs inside Router and contains Tab definitions. Switching tabs preserves their screen state. Present screens outside the tabs when they should cover the tab bar.

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Tabs#members) for types and documented defaults.
