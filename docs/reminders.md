# Schedule daily reminders

Local notifications are one-shot requests. To offer a daily reminder, schedule a bounded set of future dates and replenish it when the app opens. An optional background task can also replenish them, but its timing is controlled by the OS.

## Schedule the next seven mornings

```tsx
import { backgroundTasks, notifications, permissions, storage } from 'kuito';

const TASK = 'reminders.top-up';
const ENABLED = 'reminders.daily';

async function topUp() {
  if ((await storage.get(ENABLED)) !== 'on') return;
  for (let day = 1; day <= 7; day++) {
    const at = new Date();
    at.setDate(at.getDate() + day);
    at.setHours(9, 0, 0, 0);
    const id = `morning-${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
    await notifications.schedule({ id, title: 'Time to stretch', at });
  }
}

backgroundTasks.define(TASK, topUp);

export async function enableMornings(): Promise<string> {
  if ((await permissions.request('notifications')).status !== 'granted')
    return 'Notifications are off';
  await storage.set(ENABLED, 'on');
  await topUp();
  if ((await backgroundTasks.status()) !== 'available')
    return 'Open the app each week to keep reminders scheduled';
  await backgroundTasks.schedule(TASK, { minimumInterval: 24 * 60 });
  return 'Next seven mornings scheduled';
}

export async function replenishOnLaunch() {
  if ((await permissions.check('notifications')).status === 'granted') await topUp();
}
```

Declare `permissions.notifications` and `backgroundTasks: ['reminders.top-up']` in `kuito.config.ts`, then rebuild. Define the task at module scope so a headless background launch can find it. Call `replenishOnLaunch` during normal app startup too.

Stable date IDs replace existing requests instead of duplicating them. Persist the scheduled IDs if the user needs to cancel only these reminders; call `notifications.cancel(id)` for each. Avoid `cancelAll` when the app has unrelated notifications. Recompute local dates after a time-zone or schedule change.

See [notifications](notifications.md), [background tasks](background-tasks.md) and [permissions](permissions.md).
