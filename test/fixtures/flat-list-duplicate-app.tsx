import { List, Text } from 'kuito';

export default function App() {
  return (
    <List data={[{ id: 'a' }, { id: 'a' }]} renderItem={({ item }) => <Text>{item.id}</Text>} />
  );
}
