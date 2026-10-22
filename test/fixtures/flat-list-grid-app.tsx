import { List, Text, signal } from 'kuito';

export default function App() {
  const photos = signal([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
  const none = signal<{ id: string }[]>([]);

  return [
    <List
      id="grid"
      data={photos.value}
      columns={2}
      gap={8}
      separator={() => <Text>—</Text>}
      header={() => <Text>Photos</Text>}
      renderItem={({ item }) => <Text>{item.id}</Text>}
    />,
    <List
      id="rail"
      horizontal
      inverted
      data={none.value}
      renderItem={({ item }) => <Text>{item.id}</Text>}
      empty={() => <Text>Nothing yet</Text>}
    />,
  ];
}
