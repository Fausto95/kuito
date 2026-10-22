import { Pressable, Text, goBack, type RouteOptions, type ScreenProps } from 'kuito';
import { evaluated } from '../../_record/evaluated';

evaluated('show');

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function ShowScreen({ id }: ScreenProps<Params>) {
  return (
    <Pressable id="show-back" onPress={() => goBack()}>
      <Text id="show-id">{`show ${id}`}</Text>
    </Pressable>
  );
}
