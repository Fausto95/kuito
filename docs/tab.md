# Tab

Configure one destination in a native tab bar. Use it for a section such as Library or Settings.

## Give a tab a title and platform icon

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

Place Tab inside Tabs and put its routes inside it. Use stable names and meaningful accessible titles. Supply the appropriate icon name for each platform.

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Tab#members) for types and documented defaults.
