// Observe notifications received in the foreground.
import { Text, notifications, signal } from 'kuito';

function Inbox() {
  const latest = signal('');

  // Stops when Inbox unmounts.
  notifications.watch('received', (notification) => {
    if (notification.remote) latest.value = notification.title ?? '';
  });

  return <Text>{latest.value}</Text>;
}
