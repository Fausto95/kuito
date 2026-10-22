import { joined } from './intl-list-format';
import { Text } from 'kuito';

// Intl.ListFormat is installed before the module that names it runs.
export default function App() {
  return <Text id="joined">{joined}</Text>;
}
