import AVFoundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

extension MediaPickerRequest {
    var images: Bool { mediaTypes.contains(.images) }
    var videos: Bool { mediaTypes.contains(.videos) }
}

/// Writes picked and captured media into the app's cache, where `<Image>` and
/// FileSystem read them. Every function here blocks: call it off the main
/// thread.
enum KuitoPickedMedia {
    static func directory() throws -> URL {
        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = caches.appendingPathComponent("ImagePicker", isDirectory: true)

        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        return directory
    }

    /// An image file in any format ImageIO reads (HEIC, JPEG, PNG...), decoded
    /// no larger than the request allows, upright.
    static func image(at file: URL, named name: String?, _ request: MediaPickerRequest) throws -> MediaAsset {
        guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Double,
              let height = properties[kCGImagePropertyPixelHeight] as? Double
        else { throw KuitoModuleError("ERR_IMAGE", "\(name ?? file.lastPathComponent) is not an image iOS can read") }

        // EXIF orientations 5 to 8 turn the image a quarter: its upright size swaps.
        let turned = ((properties[kCGImagePropertyOrientation] as? Int) ?? 1) >= 5
        let upright = turned ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
        let size = fitted(upright, request)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(size.width, size.height),
        ]

        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw KuitoModuleError("ERR_IMAGE", "\(name ?? file.lastPathComponent) could not be decoded")
        }

        let alpha = properties[kCGImagePropertyHasAlpha] as? Bool ?? false

        return try write(UIImage(cgImage: image), alpha: alpha, named: name, request)
    }

    /// An image the camera or the system editor handed over in memory.
    static func image(_ image: UIImage, named name: String?, _ request: MediaPickerRequest) throws -> MediaAsset {
        let size = fitted(CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale), request)
        let format = UIGraphicsImageRendererFormat()

        format.scale = 1
        format.opaque = true

        // Drawing applies the image's orientation and scales it in one pass.
        let upright = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }

        return try write(upright, alpha: false, named: name, request)
    }

    /// A video file, moved as it is (no transcoding) from a temporary file the caller owns.
    static func video(movingFrom file: URL, named name: String?) async throws -> MediaAsset {
        let ext = file.pathExtension.isEmpty ? "mov" : file.pathExtension.lowercased()
        let destination = try directory().appendingPathComponent("\(UUID().uuidString).\(ext)")

        try FileManager.default.moveItem(at: file, to: destination)

        let asset = AVURLAsset(url: destination)
        let duration = try await asset.load(.duration)
        let track = try await asset.loadTracks(withMediaType: .video).first
        var size = CGSize.zero

        if let track {
            let (natural, transform) = try await track.load(.naturalSize, .preferredTransform)
            let rect = CGRect(origin: .zero, size: natural).applying(transform)

            size = CGSize(width: abs(rect.width), height: abs(rect.height))
        }

        return MediaAsset(
            uri: destination.absoluteString,
            width: size.width.rounded(),
            height: size.height.rounded(),
            type: .video,
            mimeType: UTType(filenameExtension: ext)?.preferredMIMEType ?? "video/quicktime",
            fileName: fileName(name, ext: ext, fallback: destination),
            fileSize: try fileSize(destination),
            duration: (duration.seconds * 1000).rounded()
        )
    }

    /// JPEG at the request's quality, or PNG for an image with transparency.
    private static func write(_ image: UIImage, alpha: Bool, named name: String?, _ request: MediaPickerRequest) throws -> MediaAsset {
        let ext = alpha ? "png" : "jpg"
        let data = alpha ? image.pngData() : image.jpegData(compressionQuality: request.quality)

        guard let data else { throw KuitoModuleError("ERR_IMAGE", "The image could not be encoded") }

        let destination = try directory().appendingPathComponent("\(UUID().uuidString).\(ext)")

        try data.write(to: destination)

        return MediaAsset(
            uri: destination.absoluteString,
            width: image.size.width * image.scale,
            height: image.size.height * image.scale,
            type: .image,
            mimeType: alpha ? "image/png" : "image/jpeg",
            fileName: fileName(name, ext: ext, fallback: destination),
            fileSize: Double(data.count),
            duration: nil
        )
    }

    /// The largest size within `maxWidth` and `maxHeight` with `size`'s aspect ratio; never larger than `size`.
    private static func fitted(_ size: CGSize, _ request: MediaPickerRequest) -> CGSize {
        let scale = min(1, request.maxWidth.map { $0 / size.width } ?? 1, request.maxHeight.map { $0 / size.height } ?? 1)

        return CGSize(width: max(1, (size.width * scale).rounded()), height: max(1, (size.height * scale).rounded()))
    }

    /// The library's name for the asset with the written file's extension, or the file's own name.
    private static func fileName(_ name: String?, ext: String, fallback: URL) -> String {
        guard let name, !name.isEmpty else { return fallback.lastPathComponent }

        return "\((name as NSString).deletingPathExtension).\(ext)"
    }

    private static func fileSize(_ file: URL) throws -> Double {
        Double(try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0)
    }
}
