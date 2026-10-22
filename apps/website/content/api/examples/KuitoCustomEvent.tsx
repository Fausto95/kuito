import { Box, KuitoCustomEvent, Pressable, Text, onMount, ref } from 'kuito';

// A row deep in the feed asks the feed to refresh, without a callback prop
// threaded through every level between them.
function Row() {
  const row = ref();
  const ask = () =>
    row.current?.dispatchEvent(
      new KuitoCustomEvent('refresh', { detail: { force: true }, bubbles: true }),
    );

  return (
    <Pressable ref={row} onPress={ask}>
      <Text>Reload</Text>
    </Pressable>
  );
}

function Feed() {
  const feed = ref();

  onMount(() => feed.current?.addEventListener('refresh', () => console.log('refreshing')));

  return (
    <Box ref={feed}>
      <Row />
    </Box>
  );
}
