# Schedule background work

Ask the operating system to run occasional work while your app is not in front. Use it for opportunistic sync or maintenance, not an exact timer.

## Declare the task in app configuration

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  backgroundTasks: ['sync'],
} satisfies KuitoConfig;
```

## Define and schedule a sync task

```tsx
import { Button, Text, VStack, backgroundTasks, storage, task } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
backgroundTasks.define('sync', async ({ deadline }) => {
  const remaining = deadline - Date.now() - 1000;
  if (remaining <= 0) return;
  const response = await fetch('https://example.com/feed', {
    signal: AbortSignal.timeout(remaining),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  await storage.set('feed', await response.text());
});

export default function App() {
  const enable = task(async () => {
    if ((await backgroundTasks.status()) !== 'available')
      throw new Error('Background refresh is unavailable');
    await backgroundTasks.schedule('sync', { minimumInterval: 60, requiresNetwork: true });
  });
  return (
    <VStack>
      <Button disabled={enable.running.value} onPress={() => void enable.run().catch(() => {})}>
        Enable background sync
      </Button>
      <Text>{enable.error.value ? String(enable.error.value) : ''}</Text>
    </VStack>
  );
}
```

## Behavior and limits

Define a named task at module scope, declare that name in config, then schedule it. The operating system chooses when it runs and may delay or skip execution. Keep work bounded, finish before the supplied deadline, and make repeated runs safe. `status` reports whether OS policy allows background tasks; `cancel` removes a schedule. Background work has no mounted screen to update.

## Continue

Read [App state](app-state.md) for the related workflow. The API reference lists every method, option, event and return type.
