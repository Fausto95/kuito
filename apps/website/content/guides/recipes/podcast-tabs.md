# Deep-linked tabs

Two tabs, a podcast screen pushed on the first, a modal for adding one, and a header with a large title, a Sort button, an Add button and a search field. A link opens any of them.

**Use it for**

- `Router`, `Tabs` and `Tab`, with `Link` and `navigate` between screens.
- A modal route (`presentation="modal"`) over the tabs.
- `linking`, so `kuito://podcast/1`, `kuito://up-next` and `kuito://add` open the matching screen. The demo's `urlSchemes` includes `kuito`.

The whole screen is [demo/recipes/podcast-tabs.tsx](../../../../../demo/recipes/podcast-tabs.tsx).

## Name the routes, then link to them

The module adds the route names to `Routes`, so `routes.podcast({ id })` is typed. The header's search writes a signal the list filters on.

```tsx
import {
  Link,
  Route,
  Router,
  Tab,
  Tabs,
  Text,
  goBack,
  navigate,
  routes,
  signal,
  type RouteTo,
  type ScreenProps,
} from 'kuito';

declare module 'kuito' {
  interface Routes {
    podcasts: RouteTo;
    podcast: RouteTo<{ id: number }>;
    upNext: RouteTo;
    addPodcast: RouteTo;
  }
}

const followed = signal(['Hardcore History', 'Song Exploder']);

function Podcasts() {
  return <Link to={routes.podcast({ id: 0 })}>Hardcore History</Link>;
}

function Podcast({ id }: ScreenProps<{ id: number }>) {
  return <Text>{followed.value[id] ?? 'Unknown podcast'}</Text>;
}

function UpNext() {
  return <Text>Nothing queued</Text>;
}

function AddPodcast() {
  return <Text>Add one</Text>;
}

export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="listen" title="Listen" icon={{ ios: 'headphones', android: 'headphones' }}>
          <Route
            name="podcasts"
            path="/"
            screen={Podcasts}
            title="Podcasts"
            header={{
              largeTitle: true,
              trailing: [
                {
                  label: 'Add',
                  icon: { ios: 'plus', android: 'add' },
                  onPress: () => navigate(routes.addPodcast()),
                },
              ],
            }}
          />
          <Route
            name="podcast"
            path="/podcast/:id"
            params={{ id: Number }}
            screen={Podcast}
            title="Podcast"
          />
        </Tab>
        <Tab name="up-next" title="Up Next" icon={{ ios: 'list.bullet', android: 'queue_music' }}>
          <Route name="upNext" path="/up-next" screen={UpNext} title="Up Next" />
        </Tab>
      </Tabs>
      <Route
        name="addPodcast"
        path="/add"
        screen={AddPodcast}
        title="Add a podcast"
        presentation="modal"
        header={{ leading: [{ label: 'Cancel', onPress: goBack }] }}
      />
    </Router>
  );
}
```

## Related

- [Navigation](../navigation.md#a-tabbed-app): tabs
- [Navigation](../navigation.md#add-buttons-a-large-title-or-search-to-the-header): the header
- [Navigation](../navigation.md#open-the-app-from-a-link): `linking` and `urlSchemes`
