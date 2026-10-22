import { Text, image } from 'kuito';

// The test drives the API as an app would, from inside the kernel.
Object.assign(globalThis, { image });

export default function App() {
  return <Text>image</Text>;
}
