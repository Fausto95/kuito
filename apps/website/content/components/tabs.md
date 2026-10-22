# Tabs

`Tabs` is a native tab bar inside a [Router](./router.md): `UITabBarController` on iOS, Material's bottom navigation on Android. Each `Tab` is a stack of its own routes, kept with its state while the user switches tabs.

Use it for:

- an app's top-level sections: home, search, library;
- sections that each keep their own history;
- a tab bar with the platform's own look and behavior.

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

`navigate` to a route in another tab selects that tab ([navigation](../guides/navigation.md)).

## Patterns

### Name the tab icon for each platform

`icon` is a symbol name both platforms share, `{ ios, android }` for one name each, or `{ uri }` for any image.

```tsx
import { Route, Router, Tab, Tabs, Text } from 'kuito';

function Search() {
  return <Text padding={16}>Search</Text>;
}

export default function App() {
  return (
    <Router>
      <Tabs>
        <Tab name="search" title="Search" icon={{ ios: 'magnifyingglass', android: 'search' }}>
          <Route name="search" path="/search" screen={Search} />
        </Tab>
      </Tabs>
    </Router>
  );
}
```

### Declare the tabs of route files

An app of route files declares its tab bar in `_layout.tsx`: each top-level `(name)` group is the tab of that name.

```tsx
export const tabs = [
  { name: 'shows', title: 'Shows', icon: 'tv' },
  { name: 'search', title: 'Search', icon: { ios: 'magnifyingglass', android: 'search' } },
];
```

## Platform differences

|         | iOS                  | Android                      |
| ------- | -------------------- | ---------------------------- |
| Tab bar | `UITabBarController` | Material's bottom navigation |
| Icons   | SF Symbols           | Material Symbols             |

## Accessibility

The tab bar is the platform's own: screen readers read each tab's `title` and which one is selected.

## Related

- [Router](./router.md)
- [Navigation](../guides/navigation.md)
- [Symbol](./symbol.md)
