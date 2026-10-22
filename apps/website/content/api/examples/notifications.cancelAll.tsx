// Cancel all app notifications.
import { Button, notifications, storage } from 'kuito';

async function signOut() {
  await notifications.cancelAll(); // no reminders for the account that left
  await storage.clear();
}

<Button onPress={signOut}>Sign out</Button>;
