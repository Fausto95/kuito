import { List, Pressable, Text, signal } from 'kuito';

type Filter = 'all' | 'saved';

const ALL = [{ id: 'a' }, { id: 'b' }];
const SAVED = [{ id: 'a' }];

/** Keys and row ids both follow the filter, like a list with tabs over the same items. */
export default function App() {
  const filter = signal<Filter>('all');

  return [
    <Pressable label="saved" id="saved" onPress={() => (filter.value = 'saved')} />,
    <Pressable label="all" id="all" onPress={() => (filter.value = 'all')} />,
    <List
      id="list"
      data={filter.value === 'saved' ? SAVED : ALL}
      itemKey={(item) => filter.value + '-' + item.id}
      renderItem={({ item }) => <Text id={filter.value + '-' + item.id}>{item.id}</Text>}
    />,
  ];
}
