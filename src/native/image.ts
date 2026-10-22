import Image, { type ImageSize, type PrefetchCache } from '../../native/modules/image/image';
import type { RemoteImageSource } from '../ui/props.generated';

export type { ImageSize } from '../../native/modules/image/image';

export interface PrefetchOptions {
  /** The caches the image fills; `memory-disk` by default, as on an Image. */
  cache?: PrefetchCache;
}

const CACHES: readonly string[] = ['memory-disk', 'memory', 'disk'];

/**
 * Loads and decodes the image a URL or `{ uri, headers }` names, ahead of an
 * Image showing it, and resolves its size in pixels. An Image of the same URL
 * then shows it from the cache.
 */
export function prefetch(
  src: string | RemoteImageSource,
  options: PrefetchOptions = {},
): Promise<ImageSize> {
  const { uri, headers = {} } = typeof src === 'string' ? { uri: src } : src;
  const { cache = 'memory-disk' } = options;

  if (typeof uri !== 'string' || uri === '')
    return Promise.reject(
      new TypeError(
        'asset' in Object(src)
          ? 'image.prefetch: a bundled image is in the app already; prefetch takes a URL or { uri, headers }'
          : `image.prefetch: takes a URL or { uri, headers }, not ${JSON.stringify(src)}`,
      ),
    );

  if (!CACHES.includes(cache))
    return Promise.reject(
      new TypeError(`image.prefetch: cache must be memory-disk, memory or disk, not ${cache}`),
    );

  return Image.prefetch({ uri, headers: { ...headers }, cache });
}
