import { List, Text, signal } from 'kuito';

const ROWS = Array.from({ length: 200 }, (_, index) => ({
  id: 'row-' + index,
  title: 'Row ' + index,
}));

export default function App() {
  const offset = signal(0);

  return [
    <Text id="offset">{'At ' + Math.round(offset.value)}</Text>,
    <List
      id="feed"
      data={ROWS}
      itemKey={(row) => row.id}
      renderItem={({ item }) => <Text>{item.title}</Text>}
      onScroll={(event) => (offset.value = event.y)}
    />,
  ];
}
