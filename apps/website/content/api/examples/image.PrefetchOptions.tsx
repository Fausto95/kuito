// Configure a thumbnail prefetch.
import { image } from 'kuito';

// A one-off picture: keep it on disk for the next launch, not in memory now.
const options: image.PrefetchOptions = { cache: 'disk' };

await image.prefetch('https://example.com/onboarding.png', options);
