import { Text, actionSheet, alert, prompt } from 'kuito';

// The test drives the APIs as an app would, from inside the kernel.
Object.assign(globalThis, { actionSheet, alert, prompt });

export default function App() {
  return <Text>dialogs</Text>;
}
