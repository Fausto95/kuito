import { signal, type HeaderItem, type RouteOptions } from 'kuito';

const editing = signal(false);

const edit: HeaderItem = {
  label: 'Edit',
  onPress: () => (editing.value = !editing.value),
};
const add: HeaderItem = {
  label: 'Add',
  icon: { ios: 'plus', android: 'add' },
  onPress: () => console.log('add'),
};

export const options: RouteOptions = {
  title: 'Playlists',
  header: { leading: [edit], trailing: [add] },
};
