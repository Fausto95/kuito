// Accept supported request-header formats.
function authorized(token: string, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);

  headers.set('Authorization', `Bearer ${token}`);

  return headers;
}

const response = await fetch('https://api.example.com/me', {
  headers: authorized('abc123', [['Accept', 'application/json']]),
});
const me = await response.json();
