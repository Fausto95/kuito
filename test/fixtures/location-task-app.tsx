import { Text, location } from 'kuito';

const tracked: unknown[] = [];

// At module scope, as an app defines it: a background launch defines it too.
location.defineUpdates('track', ({ name, deadline, locations }) => {
  tracked.push({ name, deadline, locations });
});

// The test drives the API as an app would, from inside the kernel.
Object.assign(globalThis, { location, tracked });

export default function App() {
  return <Text>location task</Text>;
}
