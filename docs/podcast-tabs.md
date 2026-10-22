# Combine tabs, detail routes and a modal

Give each tab its own routes, then declare a modal alongside the tab container. Typed destinations let links and header actions share route definitions.

## Declare and open routes

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

The podcast route parses `:id` as a number and passes it to the screen. The Add header action opens a modal over the tabs; Cancel uses `goBack`. `Router linking` routes incoming URLs to matching paths.

Add your scheme to `urlSchemes` in app config and rebuild before testing links such as `myapp://podcast/0`. A route path alone does not register an OS URL scheme. The app must also validate whether a requested record exists and whether the user may see it.

See [navigation](navigation.md), [Tabs](tabs.md) and [linking](linking.md).
