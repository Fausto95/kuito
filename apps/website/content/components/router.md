# Router

`Router` is the app's navigation, written as JSX: its `Route` children are the screens, shown in native stacks, sheets and tab bars. An app has one. An app of [route files](../guides/navigation.md) gets this tree from the compiler; write it by hand to declare routes in code.

Use it for:

- an app whose routes are declared in one file rather than a directory;
- routes whose screens come from a package;
- trying out navigation in a single-file demo.

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

A `Route`'s `name` is its key in `routes`; `path` is what a deep link's path matches (segments, `:name` params and a final `*name`); `params` says how a link's text parses into each param, `String` by default, `Number` or `Boolean`. Routes directly in a Router form one stack.

## Patterns

### Present a route as a sheet or a modal

`presentation` is `'push'` (the default), `'sheet'`, `'modal'` or `'fullScreen'`. A sheet route takes `snapPoints` as a [Sheet](./sheet.md) does.

```tsx
import { Route, Router, Text } from 'kuito';

function Home() {
  return <Text padding={16}>Home</Text>;
}

function Settings() {
  return <Text padding={16}>Settings</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} />
      <Route
        name="settings"
        path="/settings"
        screen={Settings}
        presentation="sheet"
        snapPoints={['50%', '90%']}
      />
    </Router>
  );
}
```

### Follow deep links

`linking` navigates to the route that the link which opened the app matches, and to each link that arrives while it runs. It is off by default. The schemes and domains come from `kuito.config.ts` ([linking](../../../../docs/linking.md)).

```tsx
import { Route, Router, Text, type ScreenProps } from 'kuito';

function Show({ id }: ScreenProps<{ id: number }>) {
  return <Text padding={16}>{`Show ${id}`}</Text>;
}

export default function App() {
  return (
    <Router linking>
      <Route name="show" path="/show/:id" params={{ id: Number }} screen={Show} />
    </Router>
  );
}
```

### Give a screen its header and system bars

`header` takes buttons on either side, a large title and a search field; `systemBars` takes a [SystemBars](./system-ui.md)'s props while the screen is focused.

```tsx
import { Route, Router, Text } from 'kuito';

function Library() {
  return <Text padding={16}>Library</Text>;
}

export default function App() {
  return (
    <Router>
      <Route
        name="index"
        path="/"
        screen={Library}
        title="Library"
        header={{
          largeTitle: true,
          trailing: [
            {
              label: 'Add',
              icon: { ios: 'plus', android: 'add' },
              onPress: () => console.log('add'),
            },
          ],
        }}
        systemBars={{ statusBar: { content: 'dark' } }}
      />
    </Router>
  );
}
```

## Platform differences

|             | iOS                             | Android                             |
| ----------- | ------------------------------- | ----------------------------------- |
| Stack       | `UINavigationController`        | A native stack with predictive back |
| Sheet route | `UISheetPresentationController` | Material's `BottomSheetDialog`      |

## Accessibility

Each screen's `title` is its native header's title, which screen readers read as the platform's own. Give every route that shows a header one.

## Related

- [Navigation](../guides/navigation.md): route files, `navigate`, `present`
- [Tabs](./tabs.md)
- [Link](./link.md)
- [Routes in JSX, in depth](../../../../docs/navigation.md#routes-in-jsx)
