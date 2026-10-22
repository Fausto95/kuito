// The reminders recipe on the headless host, with notifications,
// permissions, background tasks and storage faked.
import { assert, press, render, screen, test } from 'kuito/tests';
import Reminders, { DAILY, TOP_UP, mornings } from './reminders';

function fakes(answer: 'granted' | 'denied') {
  const stored = new Map<string, string>();
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const registered: string[] = [];
  let made = 0;
  const modules = {
    Permissions: {
      check: () => ({ status: 'undetermined', canAskAgain: true }),
      request: () => ({ status: answer, canAskAgain: false }),
    },
    Notifications: {
      schedule: ({ id = `local-${++made}` }: { id?: string }) => {
        scheduled.push(id);

        return id;
      },
      cancel: (id: string) => void cancelled.push(id),
    },
    BackgroundTasks: {
      register: (name: string) => void registered.push(name),
      status: () => 'available',
    },
    Storage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
  };

  return { stored, scheduled, cancelled, registered, modules };
}

test('mornings are the next seven at 9:00, today’s only while it is ahead', () => {
  const early = mornings(new Date(2026, 9, 22, 8, 30));
  const late = mornings(new Date(2026, 9, 22, 9, 30));

  assert.equal(early.length, 7);
  assert.deepEqual(early[0], new Date(2026, 9, 22, 9));
  assert.deepEqual(late[0], new Date(2026, 9, 23, 9));
  assert.deepEqual(late[6], new Date(2026, 9, 29, 9));
});

test('a reminder in ten minutes asks first, shows, and cancels', async () => {
  const { scheduled, cancelled, modules } = fakes('granted');

  await render(<Reminders />, { modules });
  await press(screen.getByText('Remind me in 10 minutes'));

  assert.deepEqual(scheduled, ['local-1']);
  assert.ok(screen.getByText('Reminder set'));

  const cancel = screen.getByRole('button', { name: /^Cancel At / });

  await press(cancel);

  assert.deepEqual(cancelled, ['local-1']);
  assert.equal(screen.queryByRole('button', { name: /^Cancel At / }), null);
  assert.ok(screen.getByText('Reminder cancelled'));
});

test('every morning schedules a week ahead and the background top-up', async () => {
  const { stored, scheduled, registered, modules } = fakes('granted');

  await render(<Reminders />, { modules });
  await press(screen.getByRole('switch', { name: 'Every morning at 9:00' }));

  assert.equal(new Set(scheduled).size, 7);
  assert.ok(scheduled.every((id) => id.startsWith('daily-')));
  assert.deepEqual(registered, [TOP_UP]);
  assert.equal(stored.get(DAILY), 'on');
  // The switch's label, and the status under the buttons.
  assert.equal(screen.getAllByText('Every morning at 9:00').length, 2);
});

test('a refused permission says where to turn notifications on', async () => {
  const { scheduled, modules } = fakes('denied');

  await render(<Reminders />, { modules });
  await press(screen.getByRole('switch', { name: 'Every morning at 9:00' }));

  assert.ok(screen.getByText('Notifications are off: turn them on in Settings'));
  assert.deepEqual(scheduled, []);
  assert.equal(screen.getByRole('switch').props.checked, false);
});
