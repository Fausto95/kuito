// React to changes and clean up work.
import { Text, effect, signal } from 'kuito';

const query = signal('');
const results = signal<string[]>([]);

effect(() => {
  const term = query.value;
  // Waits for typing to pause; the cleanup cancels the timer before the next run.
  const timer = setTimeout(async () => {
    const response = await fetch(`https://api.example.com/search?q=${encodeURIComponent(term)}`);

    results.value = (await response.json()) as string[];
  }, 300);

  return () => clearTimeout(timer);
});

<Text>{results.value.length} results</Text>;
