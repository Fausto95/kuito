import { Button, List, Text, ref, type ListHandle, type ScrollToIndexOptions } from 'kuito';

function Chapters(props: { titles: string[]; current: number }) {
  const list = ref<ListHandle>();
  // Centers the current chapter, with room for the header above it.
  const toCurrent: ScrollToIndexOptions = {
    index: props.current,
    align: 0.5,
    margin: 16,
    animated: true,
  };

  return (
    <>
      <Button onPress={() => list.current?.scrollToIndex(toCurrent)}>Current chapter</Button>
      <List ref={list} data={props.titles} renderItem={({ item }) => <Text>{item}</Text>} />
    </>
  );
}
