// Build request headers.
const headers = new Headers({ 'Content-Type': 'application/json' });

headers.append('Accept', 'application/json');
headers.get('content-type'); // 'application/json'

await fetch('https://example.com/api', { headers });
