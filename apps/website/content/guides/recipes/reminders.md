# Reminders

A reminder in ten minutes, cancelled with a tap, and one every morning at 9:00. Notifications do not repeat, so the app schedules the next week and a background task tops that week up while the app is closed.

**Use it for**

- Asking for notification permission, then scheduling and cancelling a local notification.
- Declaring the background task in `kuito.config.ts` and defining it at module scope, so a background launch finds it.
- Saying so when background refresh is off, instead of pretending the mornings will keep coming.

The whole screen is [demo/recipes/reminders.tsx](../../../../../demo/recipes/reminders.tsx). The demo config declares `permissions.notifications` and `backgroundTasks: ['reminders.top-up']`.

## Schedule the next week, and top it up

`notifications.schedule` takes a date. The morning ids are the date, so scheduling the same morning again replaces it. `backgroundTasks.define` is at module scope: a background launch evaluates the modules and does not mount the screen. `status()` is `available` when the system will run the task.

```tsx
import { backgroundTasks, notifications, permissions, storage } from 'kuito';

const TOP_UP = 'reminders.top-up';
const DAILY = 'reminders.daily';

export async function remindInTenMinutes() {
  const { status } = await permissions.check('notifications');
  const allowed =
    status === 'granted' || (await permissions.request('notifications')).status === 'granted';

  if (!allowed) return;

  const at = new Date(Date.now() + 10 * 60_000);

  await notifications.schedule({
    id: 'in-ten-minutes',
    title: 'Reminder',
    body: 'Time to stretch',
    at,
  });
}

backgroundTasks.define(TOP_UP, async () => {
  if ((await storage.get(DAILY)) !== 'on') return;

  const at = new Date();

  at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  await notifications.schedule({
    id: 'daily-next',
    title: 'Good morning',
    body: 'Time to stretch',
    at,
  });
});

export async function enableMornings() {
  await storage.set(DAILY, 'on');
  await backgroundTasks.schedule(TOP_UP, { minimumInterval: 24 * 60 });
}
```

Remote push is a separate registration. This recipe only schedules local notifications.

When `backgroundTasks.status()` is not `available`, the screen says to open the app once a week so the mornings stay scheduled. iOS runs a request once and Kuito submits the next; Android's periodic job repeats. The limits are in [Background tasks](../../../../../docs/background-tasks.md#platform-limits).

## Related

- [Background tasks](../../../../../docs/background-tasks.md#declare-them-in-kuitoconfigts): the config key
- [Permissions](../../../../../docs/permissions.md): asking for notifications
