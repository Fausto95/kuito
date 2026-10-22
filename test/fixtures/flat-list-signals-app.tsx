import { List, Pressable, Text, signal } from 'kuito';

export default function App() {
  const picked = signal('a');
  const busy = signal(false);

  return [
    <Pressable label="pick-b" id="pick-b" onPress={() => (picked.value = 'b')} />,
    <Pressable label="busy" id="busy" onPress={() => (busy.value = true)} />,
    <List
      id="list"
      data={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]}
      renderItem={({ item }) =>
        picked.value === item.id ? <Text>{'★ ' + item.id}</Text> : <Text>{item.id}</Text>
      }
      footer={busy.value ? <Text>Loading…</Text> : <Text>Done</Text>}
    />,
  ];
}
