// Obtain an iOS push token.
import { notifications, platform } from 'kuito';

// On each launch: the token can change. Android rejects with ERR_UNSUPPORTED for now.
if (platform === 'ios') {
  const { service, token } = await notifications.register();

  await fetch('https://api.example.com/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, token }),
  });
}
