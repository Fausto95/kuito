import { Text, type ScreenProps } from 'kuito';

// /library is routes.library already.
export const name = 'list';

export default function List({ list }: ScreenProps<{ list: string }>) {
  return <Text id="list">{list}</Text>;
}
