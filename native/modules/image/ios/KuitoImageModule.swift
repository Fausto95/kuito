import UIKit

/// `Image` in native/modules/image/image.ts: loads an image ahead of an Image
/// showing it, through the loader and caches the renderer's Image uses.
final class KuitoImageModule: ImageSpec {
    init(context: KuitoModuleContext) {}

    @MainActor func prefetch(_ request: PrefetchRequest, _ promise: KuitoPromise<ImageSize>) {
        guard let url = URL(string: request.uri) else {
            return promise.reject("ERR_URI", "'\(request.uri)' is not a URL")
        }

        // PrefetchCache's values are CachePolicy's, less `none`.
        guard let policy = KuitoImageLoader.CachePolicy(rawValue: request.cache.rawValue) else {
            return promise.reject("ERR_CACHE", "Image.prefetch takes no cache '\(request.cache.rawValue)'")
        }

        Task { @MainActor in
            do {
                let size = try await KuitoImageLoader.shared.prefetch(url, headers: request.headers, policy: policy)

                promise.resolve(ImageSize(width: size.width, height: size.height))
            } catch {
                promise.reject("ERR_LOAD", error.localizedDescription)
            }
        }
    }
}
