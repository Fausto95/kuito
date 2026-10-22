import { VStack, Text, type RouteOptions, type ScreenProps } from 'kuito';
import { SHOWS } from '../../../_shows';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: 'Cast' };

export default function Cast({ id }: ScreenProps<Params>) {
  return (
    <VStack padding={16}>
      <Text id="cast">{`Cast of ${SHOWS[id] ?? 'Unknown'}`}</Text>
    </VStack>
  );
}
