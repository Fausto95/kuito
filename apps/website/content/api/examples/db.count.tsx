import { Text, db, type Schema } from 'kuito';

type Message = { id: number; thread: string; read: number; sentAt: number };

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'number' &&
  typeof Reflect.get(value, 'thread') === 'string' &&
  typeof Reflect.get(value, 'read') === 'number' &&
  typeof Reflect.get(value, 'sentAt') === 'number';

// Any Standard Schema works here (Valibot, Zod, ArkType); this one is hand-written.
const message: Schema<Message> = {
  '~standard': {
    version: 1,
    vendor: 'app',
    validate: (value) =>
      isMessage(value) ? { value } : { issues: [{ message: 'expected a message row' }] },
  },
};

const messages = db.table('messages', message);

function Badge(props: { thread: string }) {
  // Recounts after every write to `messages`.
  const unread = db.count(messages, { thread: props.thread, read: 0 });
  const thisWeek = db.count(messages, { sentAt: { gte: Date.now() - 7 * 86_400_000 } });

  return (
    <Text>
      {unread.value} unread, {thisWeek.value} this week
    </Text>
  );
}
