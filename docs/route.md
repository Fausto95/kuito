# Route

Register a screen in a Router. Use it when declaring navigation in TSX rather than route files.

## Register a parameterized detail screen

```tsx
import { Link, Route, Router, Text, VStack, routes, type RouteTo, type ScreenProps } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    settings: RouteTo;
  }
}

function Home() {
  return (
    <VStack padding={16}>
      <Link to={routes.show({ id: 42 })}>
        <Text>Show 42</Text>
      </Link>
    </VStack>
  );
}

function Show({ id }: ScreenProps<{ id: number }>) {
  return <Text padding={16}>{`Show ${id}`}</Text>;
}

function Settings() {
  return <Text padding={16}>Settings</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} title="Home" />
      <Route
        name="show"
        path="/show/:id"
        params={{ id: Number }}
        screen={Show}
        title={({ id }) => `Show ${id}`}
      />
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
```

## Behavior

`name` identifies the destination, `path` matches links, and `screen` renders it. Declare parameter types with `params`. Route is navigation configuration rather than a visible layout container.

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Route#members) for types and documented defaults.
