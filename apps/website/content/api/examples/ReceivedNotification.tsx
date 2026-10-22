// Refresh an inbox when a notification arrives in the foreground.
import { notifications, type ReceivedNotification } from 'kuito';

export function followNotifications(refresh: () => void) {
  return notifications.watch('received', (notification: ReceivedNotification) => {
    console.log(notification.id, notification.remote ? 'Push' : 'Local');
    refresh();
  });
}
// Outside a component, call remove() on the returned subscription when finished.
