// Register the iOS push token with your notification backend.
import { notifications, type PushToken } from 'kuito';

export async function registerPush() {
  const token: PushToken = await notifications.register();
  const response = await fetch('https://example.com/push-devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(token),
  });
  if (!response.ok) throw new Error(`Token registration failed: ${response.status}`);
}
// Call after notification permission is granted; Android push registration is unsupported.
