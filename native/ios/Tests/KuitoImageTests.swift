import UIKit
import XCTest

/// Image's `src` and loader: what each source asks the network for, and what a
/// load reports. Only local files load.
@MainActor
final class KuitoImageTests: XCTestCase {
    private var container: UIView!
    private var renderer: KuitoUIKitRenderer!
    private let image: UInt32 = 1

    override func setUp() async throws {
        container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: image, kind: "Image", parent: 0, label: "image")
    }

    func testARemoteSourceKeepsItsHeaders() throws {
        try renderer.setProperty(
            id: image, name: "src", value: Structured.image(uri: "https://example.com/a.png", headers: ["Authorization": "Bearer t"])
        )

        XCTAssertEqual(
            try view().source,
            .remote(try XCTUnwrap(URL(string: "https://example.com/a.png")), headers: ["Authorization": "Bearer t"])
        )
    }

    func testAURLStringHasNoHeaders() throws {
        try renderer.setProperty(id: image, name: "src", value: Structured.image(url: "https://example.com/a.png"))

        XCTAssertEqual(try view().source, .remote(try XCTUnwrap(URL(string: "https://example.com/a.png")), headers: [:]))
    }

    /// The test bundle has no asset catalog: the asset the source names is looked up, and missing.
    func testABundledSourceLooksUpItsAsset() {
        XCTAssertThrowsError(
            try renderer.setProperty(id: image, name: "src", value: Structured.image(asset: "logo", width: 40, height: 40))
        ) { error in
            guard case KuitoRenderError.unsupportedValue("src", _, _, let reason) = error else { return XCTFail("\(error)") }

            XCTAssertTrue(reason.contains("logo"), reason)
        }
    }

    /// C++ lays the value out; a value of another kind is no source.
    func testASourceThatIsNoRecordIsUnsupported() {
        XCTAssertThrowsError(
            try renderer.setProperty(id: image, name: "src", value: .text("https://example.com/a.png"))
        ) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error, prop == "src" else {
                return XCTFail("src threw \(error), not unsupportedValue")
            }
        }
    }

    func testTheRequestCarriesTheHeaders() throws {
        let url = try XCTUnwrap(URL(string: "https://example.com/a.png"))
        let request = KuitoImageLoader.request(url, headers: ["Authorization": "Bearer t", "Accept": "image/webp"])

        XCTAssertEqual(request.url, url)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer t")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "image/webp")
    }

    /// What image.prefetch resolves: the loaded image's size in pixels, whatever its scale.
    func testALoadedImageReportsItsSizeInPixels() async throws {
        let file = try Self.png(width: 3, height: 2)
        defer { try? FileManager.default.removeItem(at: file) }

        let loaded = try await KuitoImageLoader.shared.image(for: file, headers: [:], policy: .none, fitting: nil)

        XCTAssertEqual(loaded.pixelSize, CGSize(width: 3, height: 2))
    }

    /// A 2000-pixel photo in a 100-point square decodes to at most twice the square's pixels across.
    func testAnImageDecodesAtTheSizeItIsShown() async throws {
        let file = try Self.png(width: 2000, height: 2000)
        defer { try? FileManager.default.removeItem(at: file) }

        let window = UIWindow(frame: container.frame)

        window.addSubview(container)
        try renderer.setProperty(id: image, name: "width", value: .number(100))
        try renderer.setProperty(id: image, name: "height", value: .number(100))
        try renderer.setProperty(id: image, name: "src", value: Structured.image(url: file.absoluteString))
        container.layoutIfNeeded()

        let view = try view()
        let pixels = 100 * view.traitCollection.displayScale
        let image = await shownImage(view)
        let shown = try XCTUnwrap(image?.cgImage, "the image loads")

        XCTAssertGreaterThanOrEqual(CGFloat(shown.width), pixels)
        XCTAssertLessThanOrEqual(CGFloat(shown.width), 2 * pixels)
    }

    /// The decoded image is smaller, but `load` and image.prefetch report the photo's own size.
    func testAnImageDecodedSmallerReportsItsOwnSize() async throws {
        let file = try Self.png(width: 2000, height: 1000)
        defer { try? FileManager.default.removeItem(at: file) }

        let loaded = try await KuitoImageLoader.shared.image(
            for: file, headers: [:], policy: .none, fitting: CGSize(width: 200, height: 100)
        )

        XCTAssertLessThan(try XCTUnwrap(loaded.image.cgImage).width, 2000)
        XCTAssertEqual(loaded.pixelSize, CGSize(width: 2000, height: 1000))
    }

    /// The file is gone before the second request: only the memory cache can serve it.
    func testASmallerSizeIsServedByTheLargerDecodedImage() async throws {
        let file = try Self.png(width: 2000, height: 2000)
        let large = try await KuitoImageLoader.shared.image(
            for: file, headers: [:], policy: .memory, fitting: CGSize(width: 600, height: 600)
        )

        try FileManager.default.removeItem(at: file)

        let small = try await KuitoImageLoader.shared.image(
            for: file, headers: [:], policy: .memory, fitting: CGSize(width: 300, height: 300)
        )

        XCTAssertIdentical(small.image, large.image)
    }

    /// Prefetching keeps the bytes and reads the size from the header; the decode waits for an Image.
    func testAPrefetchReportsTheSizeInPixels() async throws {
        let file = try Self.png(width: 30, height: 20)
        defer { try? FileManager.default.removeItem(at: file) }

        let size = try await KuitoImageLoader.shared.prefetch(file, headers: [:], policy: .memoryDisk)

        XCTAssertEqual(size, CGSize(width: 30, height: 20))
    }

    /// iOS never purges the caches directory while the app runs, so it is made once, not on every fetch.
    func testLookingUpACachedFileMakesNoDirectory() throws {
        let url = try XCTUnwrap(URL(string: "https://example.com/a.png"))
        let directory = try XCTUnwrap(KuitoImageLoader.diskFile(for: url)).deletingLastPathComponent()

        try FileManager.default.removeItem(at: directory)
        defer { try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }

        _ = KuitoImageLoader.diskFile(for: url)

        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    /// The preview is decoded off the main thread, then shown under the image.
    func testAThumbHashShowsItsPreviewWhileLoading() async throws {
        try renderer.setProperty(id: image, name: "thumbhash", value: .text(Self.landscape))

        let preview = try await shownPreview()

        XCTAssertEqual(preview?.cgImage?.width, 32)
        XCTAssertEqual(preview?.cgImage?.height, 23)
    }

    func testClearingTheThumbHashDropsItsPreview() async throws {
        try renderer.setProperty(id: image, name: "thumbhash", value: .text(Self.landscape))
        _ = try await shownPreview()
        try renderer.setProperty(id: image, name: "thumbhash", value: .null)

        XCTAssertNil(try view().placeholderImage)
    }

    func testTextThatIsNotAThumbHashIsUnsupported() {
        XCTAssertThrowsError(try renderer.setProperty(id: image, name: "thumbhash", value: .text("not a hash"))) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error, prop == "thumbhash" else {
                return XCTFail("thumbhash threw \(error), not unsupportedValue")
            }
        }
    }

    /// A 3:2 image's ThumbHash: a 32 × 23 preview.
    private static let landscape = "4AcKNZqAh4dwd3d4eHh3h3CAB/eI"

    /// A solid PNG of this many pixels in the temporary directory.
    private static func png(width: Int, height: Int) throws -> URL {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("kuito-image-\(UUID().uuidString).png")
        let format = UIGraphicsImageRendererFormat()

        format.scale = 1
        try UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).pngData { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }.write(to: file)

        return file
    }

    /// The view's image once it loads, or nil after 5 s.
    private func shownImage(_ view: KuitoImageView) async -> UIImage? {
        let deadline = Date().addingTimeInterval(5)

        while view.image == nil, Date() < deadline { await Task.yield() }

        return view.image
    }

    /// The placeholder's image once the preview is decoded, or nil after 5 s.
    private func shownPreview() async throws -> UIImage? {
        let view = try view()
        let deadline = Date().addingTimeInterval(5)

        while view.placeholderImage == nil, Date() < deadline { await Task.yield() }

        return view.placeholderImage
    }

    private func view() throws -> KuitoImageView {
        try XCTUnwrap(descendant(of: container), "No KuitoImageView in the tree")
    }

    private func descendant(of view: UIView) -> KuitoImageView? {
        view as? KuitoImageView ?? view.subviews.lazy.compactMap { self.descendant(of: $0) }.first
    }
}
