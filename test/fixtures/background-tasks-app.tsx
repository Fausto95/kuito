import { Text, backgroundTasks, storage } from 'kuito';

// Tasks are defined at module scope, so a headless launch defines them too.
backgroundTasks.define('sync', async ({ name, deadline }) => {
  await storage.set('lastRun', name + '@' + deadline);
});

// What the task receives, as it receives it.
backgroundTasks.define('echo', async (run) => {
  await storage.set('echo', JSON.stringify(run));
});

backgroundTasks.define('broken', async () => {
  await storage.set('broken', 'started');

  throw new Error('the server is down');
});

// The test drives the API as an app would, from inside the kernel.
Object.assign(globalThis, { backgroundTasks });

export default function App() {
  return <Text>background tasks</Text>;
}
