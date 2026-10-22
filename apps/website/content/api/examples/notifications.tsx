// Schedule a local reminder.
import { notifications, permissions } from 'kuito';

const { status } = await permissions.request('notifications');

if (status === 'granted')
  await notifications.schedule({ title: 'Your order shipped', url: 'shop://orders/42' });
