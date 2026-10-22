import { Text, linking, share } from 'kuito';

// The test drives the APIs as an app would, from inside the kernel.
Object.assign(globalThis, { linking, share });

export default function App() {
  return <Text>apis</Text>;
}
