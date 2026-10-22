import { List, Text } from 'kuito';

export default function App() {
  return (
    <List
      id="list"
      horizontal
      data={[{ id: 'a', group: 'x' }]}
      sectionKey={(item) => item.group}
      renderSection={({ section }) => <Text>{section}</Text>}
      stickySections
      renderItem={({ item }) => <Text>{item.id}</Text>}
    />
  );
}
