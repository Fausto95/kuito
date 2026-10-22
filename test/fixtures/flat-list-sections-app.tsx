import { List, Pressable, Text, store } from 'kuito';

interface Song {
  id: string;
  album: string;
}

const library = store({
  songs: [
    { id: 'a1', album: 'Abbey Road' },
    { id: 'a2', album: 'Abbey Road' },
    { id: 'b1', album: 'Blue' },
  ] as Song[],
});

export default function App() {
  return [
    <Pressable label="move" id="move" onPress={() => (library.songs[1].album = 'Blue')} />,
    <List
      id="list"
      data={library.songs}
      sectionKey={(song) => song.album}
      renderSection={({ section, item }) => <Text>{section + ' from ' + item.id}</Text>}
      stickySections
      renderItem={({ item }) => <Text>{item.id}</Text>}
      separator={() => <Text>—</Text>}
    />,
  ];
}
