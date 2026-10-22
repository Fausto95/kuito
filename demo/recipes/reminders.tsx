import {
  Button,
  For,
  HStack,
  SafeArea,
  Text,
  Toggle,
  VStack,
  backgroundTasks,
  notifications,
  onMount,
  permissions,
  signal,
  storage,
} from 'kuito';

/**
 * Local reminders: one in ten minutes, cancelled with a tap, and one every
 * morning at 9:00. Notifications don't repeat, so the next week of mornings
 * is scheduled, and a background task tops it up while the app isn't open.
 * kuito.config.ts declares `permissions.notifications` and the task's name.
 */
export const TOP_UP = 'reminders.top-up';
export const DAILY = 'reminders.daily';

const DAYS_AHEAD = 7;

/** The next `DAYS_AHEAD` mornings at 9:00, today's included while it is still ahead. */
export function mornings(now: Date): Date[] {
  const first = new Date(now);

  first.setHours(9, 0, 0, 0);
  if (first <= now) first.setDate(first.getDate() + 1);

  return Array.from({ length: DAYS_AHEAD }, (_, day) => {
    const morning = new Date(first);

    morning.setDate(first.getDate() + day);

    return morning;
  });
}

// An id per day: scheduling a morning again replaces it instead of adding another.
const morningId = (at: Date) => `daily-${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;

const scheduleMornings = () =>
  Promise.all(
    mornings(new Date()).map((at) =>
      notifications.schedule({
        id: morningId(at),
        title: 'Good morning',
        body: 'Time to stretch',
        at,
      }),
    ),
  );

// At module scope: a background launch evaluates the app's modules without its UI.
backgroundTasks.define(TOP_UP, async () => {
  if ((await storage.get(DAILY)) === 'on') await scheduleMornings();
});

/** Asks once; afterwards the answer stands until the user changes it in Settings. */
async function allowed(): Promise<boolean> {
  const { status } = await permissions.check('notifications');

  if (status === 'granted') return true;

  return (await permissions.request('notifications')).status === 'granted';
}

type Pending = { id: string; label: string };

export default function Reminders() {
  const daily = signal(false);
  const pending = signal<Pending[]>([]);
  const status = signal('');

  const attempt = (work: () => Promise<string>) =>
    void work().then(
      (done) => (status.value = done),
      (error: Error) => (status.value = error.message),
    );

  onMount(() => void storage.get(DAILY).then((value) => (daily.value = value === 'on')));

  const remindLater = () =>
    attempt(async () => {
      if (!(await allowed())) return 'Notifications are off: turn them on in Settings';

      const at = new Date(Date.now() + 10 * 60_000);
      const id = await notifications.schedule({
        title: 'Reminder',
        body: 'Ten minutes are up',
        at,
      });
      const label = `At ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      pending.value = [...pending.value, { id, label }];

      return 'Reminder set';
    });

  const cancel = (reminder: Pending) =>
    attempt(async () => {
      await notifications.cancel(reminder.id);
      pending.value = pending.value.filter((each) => each.id !== reminder.id);

      return 'Reminder cancelled';
    });

  const setDaily = (on: boolean) =>
    attempt(async () => {
      if (on && !(await allowed())) {
        daily.value = false;

        return 'Notifications are off: turn them on in Settings';
      }

      await storage.set(DAILY, on ? 'on' : 'off');

      if (!on) {
        await Promise.all(mornings(new Date()).map((at) => notifications.cancel(morningId(at))));
        await backgroundTasks.cancel(TOP_UP);

        return 'Mornings off';
      }

      await scheduleMornings();
      await backgroundTasks.schedule(TOP_UP, { minimumInterval: 24 * 60 });

      return (await backgroundTasks.status()) === 'available'
        ? 'Every morning at 9:00'
        : 'Background refresh is off: open the app once a week to keep the mornings coming';
    });

  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <VStack padding={16} gap={16}>
        <Text fontSize={22} fontWeight="bold">
          Reminders
        </Text>
        <HStack gap={12} alignItems="center">
          <Text flex={1}>Every morning at 9:00</Text>
          <Toggle checked={daily} onChange={setDaily} label="Every morning at 9:00" />
        </HStack>
        <Button onPress={remindLater}>Remind me in 10 minutes</Button>
        <For each={pending}>
          {(reminder) => (
            <HStack gap={12} alignItems="center">
              <Text flex={1}>{reminder.label}</Text>
              <Button onPress={() => cancel(reminder)} label={`Cancel ${reminder.label}`}>
                Cancel
              </Button>
            </HStack>
          )}
        </For>
        <Text color="#8e8e93">{status.value}</Text>
      </VStack>
    </SafeArea>
  );
}
