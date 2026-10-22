import { Text, notifications } from 'kuito';

// The test drives the API as an app would, from inside the kernel.
Object.assign(globalThis, { notifications });

export default function App() {
  return <Text>notifications</Text>;
}
