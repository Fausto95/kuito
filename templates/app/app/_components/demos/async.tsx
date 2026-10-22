import { Spinner, Pressable, HStack, VStack, Text, resource, signal } from 'kuito';
import { colors } from '../theme';

interface Show {
  name: string;
  premiered: string;
}

const isShow = (value: unknown): value is Show =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof value.name === 'string' &&
  'premiered' in value &&
  typeof value.premiered === 'string';

export function AsyncDemo() {
  const id = signal(1);
  // Runs when the screen mounts; refresh() runs it again. Leaving the screen cancels it.
  const show = resource(async ({ signal }) => {
    const response = await fetch(`https://api.tvmaze.com/shows/${id.value}`, { signal });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.json();

    if (!isShow(body)) throw new Error('Unexpected response');

    return body;
  });

  const next = () => {
    id.value = (id.value % 50) + 1;
    // A failed load is shown from show.error; the returned promise adds nothing.
    show.refresh().catch(() => {});
  };

  return (
    <VStack gap={12}>
      <HStack alignItems="center" gap={12} minHeight={56}>
        {show.running.value ? (
          <Spinner />
        ) : show.error.value ? (
          <Text color="#ff3b30">
            {show.error.value instanceof Error ? show.error.value.message : 'Request failed'}
          </Text>
        ) : (
          <VStack gap={2}>
            <Text fontSize={20} fontWeight={700} color={colors.text}>
              {show.data.value?.name ?? ''}
            </Text>
            <Text fontSize={14} color={colors.muted}>
              {`Premiered ${show.data.value?.premiered ?? ''} · TVMaze show #${id.value}`}
            </Text>
          </VStack>
        )}
      </HStack>
      <Pressable
        alignItems="center"
        padding={12}
        borderRadius={12}
        backgroundColor={colors.accent}
        pressedScale={0.97}
        onPress={next}
      >
        <Text fontSize={16} fontWeight={600} color="#ffffff">
          Fetch the next show
        </Text>
      </Pressable>
    </VStack>
  );
}
