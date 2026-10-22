import { Text } from 'kuito';
import labels from './intl-labels.json';

// A JSON file is data: its text naming a format installs nothing.
export default function App() {
  return <Text>{Object.values(labels).join()}</Text>;
}
