# Router

Own the app navigation tree. Use it for explicitly declared routes or let file-based routing generate it.

## Declare a home and detail stack

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

Use one Router per app. Route parameters are typed; route names identify destinations. File-based apps normally need route files and a layout rather than a hand-written Router.

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Router#members) for types and documented defaults.
