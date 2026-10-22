// Encode query or form parameters.
const params = new URLSearchParams({ q: 'kuito', page: '2' });

params.append('tag', 'native');
params.toString(); // 'q=kuito&page=2&tag=native'

await fetch('https://example.com/search', { method: 'POST', body: params });
