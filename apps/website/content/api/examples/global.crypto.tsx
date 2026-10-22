const sessionId = crypto.randomUUID(); // '3b241101-e2bb-4255-8caf-4136c566a962'

const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
  byte.toString(16).padStart(2, '0'),
).join('');

await fetch('https://api.example.com/sessions', {
  method: 'POST',
  body: JSON.stringify({ sessionId, nonce }),
});
