import { Text, location, watch } from 'kuito';

/** The latitudes `location.position` took, as a signal's watcher sees them. */
const seen: (number | null)[] = [];

watch(location.position, (fix) => {
  seen.push(fix?.coords.latitude ?? null);
});

// The test drives the API as an app would, from inside the kernel.
Object.assign(globalThis, { location, seen });

export default function App() {
  return <Text>location</Text>;
}
