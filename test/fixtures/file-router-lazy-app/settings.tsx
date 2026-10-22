import { Text, type RouteOptions } from 'kuito';
import { evaluated } from './_record/evaluated';

evaluated('settings');

// The compiler reads presentation: it decides the route's stack before its module loads.
export const options: RouteOptions = { title: 'Settings', presentation: 'sheet' };

export default function Settings() {
  return <Text id="settings">settings</Text>;
}
