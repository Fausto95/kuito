package dev.kuito.runtime.modules.image

import dev.kuito.link.ImageSize
import dev.kuito.link.ImageSpec
import dev.kuito.link.PrefetchRequest
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.renderer.images.CachePolicy
import dev.kuito.runtime.renderer.images.KuitoImageLoader

/**
 * `Image` in native/modules/image/image.ts: loads an image ahead of an Image
 * showing it, through the loader and caches the renderer's Image uses.
 */
class KuitoImageModule(private val context: KuitoModuleContext) : ImageSpec {
    override fun prefetch(request: PrefetchRequest, promise: KuitoPromise<ImageSize>) {
        // PrefetchCache's values are CachePolicy's, less `none`.
        val policy = CachePolicy.of(request.cache.wire)
            ?: return promise.reject("ERR_CACHE", "Image.prefetch takes no cache '${request.cache.wire}'")

        KuitoImageLoader.prefetch(context.activity, request.uri, request.headers, policy) { result ->
            result
                .onSuccess { promise.resolve(ImageSize(width = it.width.toDouble(), height = it.height.toDouble())) }
                .onFailure { promise.reject("ERR_LOAD", it.message ?: it.toString()) }
        }
    }
}
