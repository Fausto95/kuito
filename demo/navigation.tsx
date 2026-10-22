import {
  Link,
  Pressable,
  Route,
  Router,
  VStack,
  Tab,
  Tabs,
  Text,
  goBack,
  routes,
  signal,
  type RouteTo,
  type ScreenProps,
  linking,
  share,
} from 'kuito';

const SHOWS = ['Severance', 'The Bear', 'Andor', 'Shogun'];

// A Router written in JSX declares its routes' types itself; file-based
// routes get them from the compiler (routes/routes.generated.d.ts).
declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    showCast: RouteTo<{ id: number }>;
    library: RouteTo;
    top: RouteTo;
    settings: RouteTo;
  }
}

function Shows() {
  const opens = signal(0);

  return (
    <VStack gap={12} padding={16}>
      <Text fontSize={13} color="#8e8e93">{`${opens.value} opened`}</Text>
      {SHOWS.map((name, index) => (
        <Link
          key={name}
          id={`show-${index}`}
          to={routes.show({ id: index })}
          onPressStart={() => opens.value++}
        >
          <Text fontSize={20}>{name}</Text>
        </Link>
      ))}
      <Link id="to-settings" to={routes.settings()}>
        <Text fontSize={17} color="#0a84ff">
          Settings
        </Text>
      </Link>
    </VStack>
  );
}

function ShowDetails({ id }: ScreenProps<{ id: number }>) {
  const name = SHOWS[id] ?? 'Unknown';
  const shared = signal('');
  const shareShow = async () => {
    const result = await share({ message: name, url: `kuito://show/${id}` });

    shared.value = [result.action, result.activityType].filter(Boolean).join(' ');
  };

  return (
    <VStack gap={12} padding={16}>
      <Text fontSize={28} fontWeight={700}>
        {name}
      </Text>
      <Link to={routes.showCast({ id })}>
        <Text fontSize={17} color="#0a84ff">
          Cast
        </Text>
      </Link>
      <Pressable onPress={() => void shareShow()}>
        <Text fontSize={17} color="#0a84ff">
          Share
        </Text>
      </Pressable>
      <Text fontSize={13} color="#8e8e93">
        {shared.value}
      </Text>
      <Pressable onPress={() => void linking.open(`https://www.tvmaze.com/search?q=${name}`)}>
        <Text fontSize={17} color="#0a84ff">
          Open on TVmaze
        </Text>
      </Pressable>
      <Pressable onPress={() => goBack()}>
        <Text fontSize={17} color="#0a84ff">
          Back
        </Text>
      </Pressable>
    </VStack>
  );
}

function Cast({ id }: ScreenProps<{ id: number }>) {
  return (
    <VStack padding={16}>
      <Text>{`Cast of ${SHOWS[id] ?? 'Unknown'}`}</Text>
    </VStack>
  );
}

function Library() {
  return (
    <VStack padding={16}>
      <Text id="library" fontSize={20}>
        Your library
      </Text>
    </VStack>
  );
}

function TopRated() {
  return (
    <VStack padding={16}>
      <Text fontSize={20}>Top rated</Text>
    </VStack>
  );
}

/** Any image works as a tab icon; the tab bar sizes and tints it. */
const STAR = {
  uri: 'https://raw.githubusercontent.com/google/material-design-icons/master/png/toggle/star/materialicons/48dp/2x/baseline_star_black_48dp.png',
};

function Settings() {
  return (
    <VStack padding={24}>
      <Text id="settings" fontSize={20}>
        Settings
      </Text>
    </VStack>
  );
}

/**
 * Native tabs and stacks: push, swipe back, switch tabs, open a sheet. Deep
 * links (`kuito://show/1`) navigate.
 */
export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="shows" title="Shows" icon="tv">
          <Route name="index" path="/" screen={Shows} title="Shows" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={ShowDetails}
            title={({ id }) => SHOWS[id] ?? 'Show'}
          />
          <Route
            name="showCast"
            path="/show/:id/cast"
            params={{ id: Number }}
            screen={Cast}
            title="Cast"
          />
        </Tab>
        <Tab
          name="library"
          title="Library"
          icon={{ ios: 'books.vertical', android: 'library_books' }}
        >
          <Route name="library" path="/library" screen={Library} title="Library" />
        </Tab>
        <Tab name="top" title="Top rated" icon={STAR}>
          <Route name="top" path="/top" screen={TopRated} title="Top rated" />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
