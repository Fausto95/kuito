import { Text, mediaPicker } from 'kuito';

// The test drives the API as an app would, from inside the kernel.
Object.assign(globalThis, { mediaPicker });

export default function App() {
  return <Text>picker</Text>;
}
