import { Text, type RouteOptions } from 'kuito';

export const options: RouteOptions = { title: 'Library', header: false };

export default function Library() {
  return <Text id="library">library</Text>;
}
