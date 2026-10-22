import { Text, fileSystem, fonts } from 'kuito';

// The test drives the APIs as an app would, from inside the kernel.
Object.assign(globalThis, { fileSystem, fonts });

export default function App() {
  return <Text>file system</Text>;
}
