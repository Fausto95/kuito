import {
  For,
  Link,
  Pressable,
  Route,
  Router,
  Tab,
  Tabs,
  Text,
  VStack,
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

const SUGGESTED = ['Radiolab', 'The Daily', 'Darknet Diaries'];

const followed = signal(['Hardcore History', 'Song Exploder', '99% Invisible']);
const queued = signal<string[]>([]);
const query = signal('');
const sorted = signal(false);

function Podcasts() {
  const shown = () => {
    const matching = followed.value.filter((name) =>
      name.toLowerCase().includes(query.value.toLowerCase()),
    );

    return sorted.value ? [...matching].sort() : matching;
  };

  return (
    <VStack padding={16} gap={8}>
      <For each={shown()}>
        {(name) => (
          <Link to={routes.podcast({ id: followed.value.indexOf(name) })} padding={12}>
            <Text fontSize={17}>{name}</Text>
          </Link>
        )}
      </For>
    </VStack>
  );
}

function Podcast({ id }: ScreenProps<{ id: number }>) {
  const name = followed.value[id] ?? 'Unknown podcast';

  return (
    <VStack padding={16} gap={16}>
      <Text fontSize={28} fontWeight={700}>
        {name}
      </Text>
      <Pressable
        onPress={() => {
          queued.value = [...queued.value, name];
          navigate(routes.upNext());
        }}
      >
        <Text color="#0a84ff">Play next</Text>
      </Pressable>
    </VStack>
  );
}

function UpNext() {
  return (
    <VStack padding={16} gap={8}>
      {queued.value.length === 0 && <Text color="#6b6b76">Nothing queued yet</Text>}
      <For each={queued.value}>{(name) => <Text fontSize={17}>{`Queued: ${name}`}</Text>}</For>
    </VStack>
  );
}

function AddPodcast() {
  return (
    <VStack padding={16} gap={8}>
      <For each={SUGGESTED.filter((name) => !followed.value.includes(name))}>
        {(name) => (
          <Pressable
            padding={12}
            onPress={() => {
              followed.value = [...followed.value, name];
              goBack();
            }}
          >
            <Text fontSize={17}>{`Follow ${name}`}</Text>
          </Pressable>
        )}
      </For>
    </VStack>
  );
}

/**
 * Two tabs, a pushed detail screen, a modal, and a native header with
 * buttons, a large title and a search field. Deep links open any of them:
 * kuito://podcast/1, kuito://up-next, kuito://add.
 */
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
              leading: [{ label: 'Sort', onPress: () => (sorted.value = !sorted.value) }],
              trailing: [
                {
                  label: 'Add',
                  icon: { ios: 'plus', android: 'add' },
                  onPress: () => navigate(routes.addPodcast()),
                },
              ],
              largeTitle: true,
              search: { placeholder: 'Your podcasts', onChange: (text) => (query.value = text) },
            }}
          />
          <Route
            name="podcast"
            path="/podcast/:id"
            params={{ id: Number }}
            screen={Podcast}
            title={({ id }) => followed.value[id] ?? 'Podcast'}
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
