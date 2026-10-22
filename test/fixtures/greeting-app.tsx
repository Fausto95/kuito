import { Text, onMount, signal } from 'kuito';

const wait = (value: string) => Promise.resolve(value);

async function greet(name: string) {
  const greeting = await wait('Hello');

  return `${greeting}, ${name}`;
}

export default function App() {
  const message = signal('…');

  onMount(() => {
    const load = async () => {
      message.value = await greet('Ada');
    };

    void load();
  });

  return <Text id="message">{message.value}</Text>;
}
