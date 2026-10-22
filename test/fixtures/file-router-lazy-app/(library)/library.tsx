import { Text, type RouteOptions } from 'kuito';
import { evaluated } from '../_record/evaluated';

evaluated('library');

export const options: RouteOptions = { title: 'Library' };

export default function Library() {
  return <Text id="library">library</Text>;
}
