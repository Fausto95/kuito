import { defineModule, fn } from '../../../src/native/define-module';

/** The caches a prefetched image may fill: Image's `cache`, less `none`. */
export type PrefetchCache = 'memory-disk' | 'memory' | 'disk';

export type PrefetchRequest = {
  uri: string;
  headers: Record<string, string>;
  cache: PrefetchCache;
};

/** In pixels, as an Image's `onLoad` reports it. */
export type ImageSize = { width: number; height: number };

// Images loaded ahead of an Image showing them (docs/primitives.md#image),
// through the loader and caches the renderer's Image uses.
export default defineModule('Image', {
  prefetch: fn.main.callback<(request: PrefetchRequest) => Promise<ImageSize>>(),
  ios: { class: 'KuitoImageModule' },
  android: { class: 'dev.kuito.runtime.modules.image.KuitoImageModule' },
});
