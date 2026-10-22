import {
  Box,
  Link,
  Pressable,
  VStack,
  Text,
  goBack,
  present,
  routes,
  signal,
  type RouteOptions,
  type ScreenProps,
} from 'kuito';
import { COLORS, SHOWS } from '../../_shows';

export type Params = { id: number };

export const options: RouteOptions<Params> = {
  title: ({ id }) => SHOWS[id] ?? 'Show',
};

export default function ShowDetails({ id }: ScreenProps<Params>) {
  const name = SHOWS[id] ?? 'Unknown';
  const rating = signal('Not rated');

  // The rating sheet answers with the stars picked, or nothing when it is swiped away.
  const rate = async () => {
    const stars = await present(routes.rate({ show: name }));

    rating.value = stars === undefined ? 'Not rated' : '★'.repeat(stars);
  };

  return (
    <VStack gap={12} padding={16}>
      {/* Flies from the list's swatch as the screen pushes (docs/navigation.md#shared-elements). */}
      <Box
        sharedId={`poster-${id}`}
        width={160}
        height={240}
        borderRadius={12}
        backgroundColor={COLORS[id]}
      />
      <Text id="show-name" fontSize={28} fontWeight={700}>
        {name}
      </Text>
      <Text id="rating" fontSize={17}>
        {rating.value}
      </Text>
      <Pressable id="rate" onPress={() => void rate()}>
        <Text fontSize={17} color="#0a84ff">
          Rate
        </Text>
      </Pressable>
      <Link id="to-cast" to={routes.showCast({ id })}>
        <Text fontSize={17} color="#0a84ff">
          Cast
        </Text>
      </Link>
      <Pressable id="back" onPress={() => goBack()}>
        <Text fontSize={17} color="#0a84ff">
          Back
        </Text>
      </Pressable>
    </VStack>
  );
}
