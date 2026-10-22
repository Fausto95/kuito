import { List, Pressable, Text, ref, signal, type ListHandle, Show } from 'kuito';

interface Track {
  id: string;
  title: string;
}

const START: Track[] = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Beta' },
];

/** Read by every row: a change re-renders the rows that are bound. */
const edition = signal(1);

function HStack(props: { title: string }) {
  const taps = signal(0);

  return (
    <Pressable onPress={() => taps.value++}>
      <Text>{props.title + ' ×' + taps.value}</Text>
    </Pressable>
  );
}

export default function App() {
  const tracks = signal<Track[]>(START);
  const ended = signal(0);
  const shown = signal(true);
  const seen = signal('');
  const list = ref<ListHandle>();

  return [
    <Pressable
      label="add"
      id="add"
      onPress={() => (tracks.value = [...tracks.value, { id: 'c', title: 'Gamma' }])}
    />,
    <Pressable
      label="rename"
      id="rename"
      onPress={() =>
        (tracks.value = tracks.value.map((track) =>
          track.id === 'b' ? { ...track, title: 'Bravo' } : track,
        ))
      }
    />,
    <Pressable
      label="edition"
      id="edition"
      onPress={() => {
        edition.value++;
      }}
    />,
    <Pressable
      label="jump"
      id="jump"
      onPress={() => list.current?.scrollToIndex({ index: 1, align: 0.5 })}
    />,
    <Pressable label="hide" id="hide" onPress={() => (shown.value = false)} />,
    <Text id="seen">{seen.value}</Text>,
    <Show when={shown.value}>
      <List
        id="list"
        ref={list}
        data={tracks.value}
        itemKey={(track) => track.id}
        renderItem={({ item, index }) => (
          <HStack title={index.value + 1 + '. ' + item.title + ' v' + edition.value} />
        )}
        separator={() => <Text>—</Text>}
        header={<Text id="header">Tracks</Text>}
        footer={<Text id="footer">{'Ended ' + ended.value}</Text>}
        onReachEnd={() => ended.value++}
        initialIndex={1}
        keyboard={{ inset: false }}
        viewability={{ threshold: 0.5 }}
        onViewableChange={({ viewableItems, changed }) => {
          seen.value =
            viewableItems.map((token) => token.key + '@' + token.index).join(',') +
            ' | ' +
            changed.map((token) => token.key + (token.visible ? '+' : '-')).join(',');
        }}
      />
    </Show>,
  ];
}
