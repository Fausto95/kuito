import { image, type PrefetchOptions } from 'kuito';

const memoryOnly: PrefetchOptions = { cache: 'memory' };

await image.prefetch(
  { uri: 'https://example.com/avatar.png', headers: { Authorization: 'Bearer token' } },
  memoryOnly,
);
