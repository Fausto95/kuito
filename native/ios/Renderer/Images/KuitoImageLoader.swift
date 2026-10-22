import CryptoKit
import ImageIO
import UIKit

enum KuitoImageError: LocalizedError {
    case http(Int)
    case undecodable
    case notBundled(String)

    var errorDescription: String? {
        switch self {
        case .http(let status): "HTTP \(status)"
        case .undecodable: "The data is not an image"
        case .notBundled(let name):
            "The app was built without the image \(name): build it again (docs/assets.md)"
        }
    }
}

/// A decoded image and the size of the image it was decoded from, in pixels:
/// what an Image's `load` and image.prefetch report.
final class KuitoLoadedImage: Sendable {
    let image: UIImage
    let pixelSize: CGSize
    /// The power of two the image was divided by; 1 is the full image.
    let sample: Int

    init(image: UIImage, pixelSize: CGSize, sample: Int) {
        self.image = image
        self.pixelSize = pixelSize
        self.sample = sample
    }

    /// Whether it shows `target` pixels as well as the full image would. The
    /// full image covers any size; nil, an unknown size, takes the full image.
    func covers(_ target: CGSize?) -> Bool {
        guard sample > 1 else { return true }
        guard let target, let decoded = image.cgImage else { return false }

        return CGFloat(decoded.width) >= target.width && CGFloat(decoded.height) >= target.height
    }
}

/// An image's encoded bytes and the pixel size its header gives, upright.
struct KuitoImageBytes: Sendable {
    let data: Data
    let pixelSize: CGSize

    /// Nil for data ImageIO can't read as an image.
    init?(_ data: Data) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }

        // EXIF orientations 5 to 8 turn the image a quarter.
        let turned = (properties[kCGImagePropertyOrientation] as? Int).map { $0 >= 5 } ?? false

        self.data = data
        self.pixelSize = turned ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
    }
}

/// Loads images once: a memory cache of decoded images, a disk cache of their
/// bytes, and one request per URL however many views ask for it. An image is
/// decoded at the size its view shows it (docs/primitives.md#image): the
/// memory cache keys it by URL and the power of two it was divided by, and
/// serves any request a larger decode covers. The disk cache keeps the
/// original bytes by URL, so a new size never downloads again. Both key an
/// image by URL alone, so headers that change per request, such as a
/// refreshed token, still find it.
@MainActor
final class KuitoImageLoader {
    enum CachePolicy: String {
        case memoryDisk = "memory-disk"
        case memory
        case disk
        case none

        var usesMemory: Bool { self == .memoryDisk || self == .memory }
        var usesDisk: Bool { self == .memoryDisk || self == .disk }
    }

    static let shared = KuitoImageLoader()

    /// Past this a decode is small enough; the bound keeps a cache lookup to a few probes.
    nonisolated static let maxSample = 64

    private let memory: NSCache<NSString, KuitoLoadedImage> = {
        let cache = NSCache<NSString, KuitoLoadedImage>()

        cache.totalCostLimit = 64 * 1024 * 1024

        return cache
    }()

    private var downloads: [URL: Task<KuitoImageBytes, Error>] = [:]
    private var decodes: [NSString: Task<KuitoLoadedImage, Error>] = [:]

    /// `target` is the view's size in pixels; nil decodes the full image.
    func image(for url: URL, headers: [String: String], policy: CachePolicy, fitting target: CGSize?) async throws
        -> KuitoLoadedImage
    {
        if policy.usesMemory, let cached = cached(url, fitting: target) { return cached }

        let bytes = try await self.bytes(for: url, headers: headers, useDisk: policy.usesDisk)

        if policy.usesMemory, let cached = cached(url, fitting: target) { return cached }

        let sample = Self.sample(bytes.pixelSize, fitting: target)
        let key = Self.key(url, sample)
        let decode = decodes[key] ?? Task.detached(priority: .userInitiated) {
            guard let image = Self.decode(bytes, sample: sample) else {
                // A header with no image behind it, such as a cut-off file: the next load downloads it again.
                if let file = Self.diskFile(for: url) { try? FileManager.default.removeItem(at: file) }

                throw KuitoImageError.undecodable
            }

            return KuitoLoadedImage(image: image, pixelSize: bytes.pixelSize, sample: sample)
        }

        decodes[key] = decode

        defer { if decodes[key] == decode { decodes[key] = nil } }

        let loaded = try await decode.value

        if policy.usesMemory { memory.setObject(loaded, forKey: key, cost: Self.cost(of: loaded.image)) }

        return loaded
    }

    /// image.prefetch: the bytes into the disk cache, decoded only when no
    /// disk cache would keep them, and the image's size in pixels.
    func prefetch(_ url: URL, headers: [String: String], policy: CachePolicy) async throws -> CGSize {
        if policy.usesMemory, let cached = cached(url, fitting: nil) { return cached.pixelSize }

        guard policy.usesDisk else { return try await image(for: url, headers: headers, policy: policy, fitting: nil).pixelSize }

        return try await bytes(for: url, headers: headers, useDisk: true).pixelSize
    }

    nonisolated static func request(_ url: URL, headers: [String: String]) -> URLRequest {
        var request = URLRequest(url: url)

        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }

        return request
    }

    /// The power of two to divide the image by: the largest that still
    /// covers `target` on both sides, so a decode is at most twice the
    /// target across.
    nonisolated static func sample(_ pixelSize: CGSize, fitting target: CGSize?) -> Int {
        guard let target, target.width > 0, target.height > 0 else { return 1 }

        let ratio = min(pixelSize.width / target.width, pixelSize.height / target.height)
        var sample = 1

        while sample < maxSample, CGFloat(sample * 2) <= ratio { sample *= 2 }

        return sample
    }

    /// The smallest decode that covers `target`, probing each sample from the largest.
    private func cached(_ url: URL, fitting target: CGSize?) -> KuitoLoadedImage? {
        var sample = Self.maxSample

        while sample >= 1 {
            if let cached = memory.object(forKey: Self.key(url, sample)), cached.covers(target) { return cached }

            sample /= 2
        }

        return nil
    }

    private func bytes(for url: URL, headers: [String: String], useDisk: Bool) async throws -> KuitoImageBytes {
        let download = downloads[url] ?? Task.detached(priority: .userInitiated) {
            try await Self.fetch(Self.request(url, headers: headers), useDisk: useDisk)
        }

        downloads[url] = download

        defer { if downloads[url] == download { downloads[url] = nil } }

        return try await download.value
    }

    private nonisolated static func key(_ url: URL, _ sample: Int) -> NSString {
        "\(sample) \(url.absoluteString)" as NSString
    }

    private nonisolated static func fetch(_ request: URLRequest, useDisk: Bool) async throws -> KuitoImageBytes {
        let file = useDisk ? request.url.flatMap(diskFile(for:)) : nil

        if let file, let data = try? Data(contentsOf: file), let bytes = KuitoImageBytes(data) { return bytes }

        let (data, response) = try await URLSession.shared.data(for: request)

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw KuitoImageError.http(http.statusCode)
        }

        guard let bytes = KuitoImageBytes(data) else { throw KuitoImageError.undecodable }

        if let file { try? data.write(to: file, options: .atomic) }

        return bytes
    }

    /// Decoded now, off the main thread, so the first frame never decodes,
    /// and only as large as the sample asks: ImageIO reads a thumbnail of
    /// that size straight from the bytes, never the full image.
    private nonisolated static func decode(_ bytes: KuitoImageBytes, sample: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(bytes.data as CFData, nil) else { return nil }

        let longest = max(bytes.pixelSize.width, bytes.pixelSize.height)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: Int((longest / CGFloat(sample)).rounded(.up)),
        ]

        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary).map { UIImage(cgImage: $0) }
    }

    /// Made once: iOS empties the caches directory only while the app isn't running.
    private nonisolated static let directory: URL? = {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }

        let directory = caches.appendingPathComponent("KuitoImages", isDirectory: true)

        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        return directory
    }()

    /// Only remote images are cached on disk; file and data URLs are already local.
    nonisolated static func diskFile(for url: URL) -> URL? {
        guard url.scheme == "http" || url.scheme == "https", let directory else { return nil }

        let name = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()

        return directory.appendingPathComponent(name)
    }

    /// What a bundled Image's `load` reports.
    static func pixelSize(of image: UIImage) -> CGSize {
        CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
    }

    private static func cost(of image: UIImage) -> Int {
        guard let cgImage = image.cgImage else { return 1 }

        return cgImage.bytesPerRow * cgImage.height
    }
}
