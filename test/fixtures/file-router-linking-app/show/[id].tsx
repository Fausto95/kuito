import { Text, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function ShowScreen({ id }: ScreenProps<Params>) {
  return <Text id={`show-${id}`}>{`show ${typeof id} ${id}`}</Text>;
}
