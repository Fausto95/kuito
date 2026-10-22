// Skip work when a background run has no time left.
import { backgroundTasks, type BackgroundTaskRun, type BackgroundTaskStatus } from 'kuito';

backgroundTasks.define('refresh', async (run: BackgroundTaskRun) => {
  if (run.deadline - Date.now() < 5000) return;
  const response = await fetch('https://example.com/feed', { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
});

export async function enableRefresh() {
  const status: BackgroundTaskStatus = await backgroundTasks.status();
  if (status === 'available') await backgroundTasks.schedule('refresh');
}
// Declare refresh in kuito.config.ts before rebuilding the native app.
