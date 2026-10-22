async function post(url: string, body: BodyInit) {
  const response = await fetch(url, { method: 'POST', body });

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
}

await post('https://api.example.com/login', new URLSearchParams({ user: 'ana', remember: '1' }));
await post('https://api.example.com/notes', 'Plain text, sent as UTF-8');
await post('https://api.example.com/upload', new TextEncoder().encode('bytes'));
