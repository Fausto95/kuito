// Cancel a request with its task.
import { Button, Text, task, type TaskContext } from 'kuito';

// The signal aborts the request when the task is cancelled or replaced.
async function search({ signal }: TaskContext, term: string): Promise<string[]> {
  const response = await fetch(`https://api.example.com/search?q=${encodeURIComponent(term)}`, {
    signal,
  });

  return (await response.json()) as string[];
}

function Search() {
  const results = task(search);

  return (
    <>
      <Button onPress={() => results.run('kuito')}>Search</Button>
      <Text>{results.data.value?.length ?? 0} results</Text>
    </>
  );
}
