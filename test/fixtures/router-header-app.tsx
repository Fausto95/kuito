import { Link, Route, Router, Text, VStack, signal, routes, type ScreenProps } from 'kuito';

const added = signal(0);
const query = signal('');
const submitted = signal('');
const rated = signal(false);

function Shows() {
  return (
    <VStack>
      <Text id="added">{`${added.value} added`}</Text>
      <Text id="query">{query.value}</Text>
      <Text id="submitted">{submitted.value}</Text>
      <Link id="to-show" to={routes.show({ id: 7 })}>
        <Text>Open</Text>
      </Link>
      <Link id="to-about" to={routes.about()}>
        <Text>About</Text>
      </Link>
    </VStack>
  );
}

function ShowScreen({ id }: ScreenProps<{ id: number }>) {
  return <Text id="show-id">{`show ${id}`}</Text>;
}

function About() {
  return <Text id="about">about</Text>;
}

export default function App() {
  return (
    <Router>
      <Route
        name="index"
        path="/"
        screen={Shows}
        title="Shows"
        header={{
          leading: [{ label: 'Edit', onPress: () => {} }],
          trailing: [
            { label: 'Add', icon: { ios: 'plus', android: 'add' }, onPress: () => added.value++ },
            { label: 'Share', icon: 'square.and.arrow.up', disabled: true, onPress: () => {} },
          ],
          largeTitle: true,
          search: {
            placeholder: 'Shows',
            onChange: (text) => (query.value = text),
            onSubmit: (text) => (submitted.value = text),
          },
        }}
      />
      <Route
        name="show"
        path="/show/:id"
        params={{ id: Number }}
        screen={ShowScreen}
        header={({ id }) => ({
          trailing: [
            { label: `Rate ${id}`, disabled: rated.value, onPress: () => (rated.value = true) },
          ],
        })}
      />
      <Route name="about" path="/about" screen={About} header={false} />
    </Router>
  );
}
