import ImageIO
import UIKit

/// Where pictures and videos go: the app's cache, which `<Image source>` and
/// FileSystem read (`cacheDirectory`), and the system may clear.
enum KuitoCameraFiles {
    static func file(extension name: String) throws -> URL {
        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = caches.appendingPathComponent("Camera", isDirectory: true)

        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        return directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(name)
    }

    /// The JPEG's size as it displays: EXIF orientations 5 to 8 turn it a quarter.
    static func uprightSize(of data: Data) -> (width: Int, height: Int) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return (0, 0) }

        let turned = ((properties[kCGImagePropertyOrientation] as? Int) ?? 1) >= 5

        return turned ? (height, width) : (width, height)
    }
}
