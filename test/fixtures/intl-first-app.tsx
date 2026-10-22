import { category } from './intl-first-plural';
import { Text } from 'kuito';

// Intl's added formats exist from the app's first module.
export default function App() {
  return <Text id="category">{category}</Text>;
}
