import UIKit

/// What an Image shows: a URL and the headers its request sends, or an
/// image the compiler bundled into the app's asset catalog under this name
/// (docs/assets.md).
enum KuitoImageSource: Equatable {
    case remote(URL, headers: [String: String])
    case bundled(String)
}

/// React Native's Image for URLs, loaded through KuitoImageLoader, with a
/// placeholder color and ThumbHash preview while loading and an optional
/// cross-fade on arrival,
/// and for bundled images, shown at once. Like React Native's network images
/// a URL has no intrinsic size: the kernel sizes a bundled image from the
/// size the compiler read (src/runtime/intrinsic-size.ts).
@MainActor
final class KuitoImageView: UIImageView, KuitoTintable {
    /// Emits loadstart, load ({ width, height } in pixels), error and loadend.
    var emit: ((String, (any KuitoEventPayload)?) -> Void)?
    var transitionDuration: TimeInterval = 0
    var cachePolicy = KuitoImageLoader.CachePolicy.memoryDisk

    var placeholderColor: UIColor? {
        didSet { placeholder.backgroundColor = placeholderColor }
    }

    var tint: UIColor? {
        didSet { applyTint() }
    }

    /// The preview fits as the image will.
    override var contentMode: UIView.ContentMode {
        didSet {
            placeholder.contentMode = contentMode
            // `none` shows the image at its own size: lay out to check the decode covers it.
            setNeedsLayout()
        }
    }

    var placeholderImage: UIImage? { placeholder.image }

    /// Subviews draw above the image, so the placeholder hides once it loads.
    private let placeholder = UIImageView()
    private var thumbHash: KuitoThumbHash?
    private(set) var source: KuitoImageSource?
    private var loading: Task<Void, Never>?
    /// The decode on screen, which a larger size replaces.
    private var decoded: KuitoLoadedImage?
    private var requested = false
    private var inFlight = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        contentMode = .scaleAspectFill
        placeholder.isUserInteractionEnabled = false
        placeholder.frame = bounds
        placeholder.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(placeholder)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Shows the hash's preview over the placeholder color once it is decoded,
    /// off the main thread; nil drops it.
    func setThumbHash(_ next: KuitoThumbHash?) {
        thumbHash = next
        placeholder.image = nil

        guard let next else { return }

        Task { [weak self] in
            let preview = await Task.detached(priority: .userInitiated) { next.preview() }.value

            guard let self, self.thumbHash === next, let pixels = preview.cgImage else { return }

            // One preview pixel per screen pixel, as on Android, where it matters: `none` shows it at its size.
            self.placeholder.image = UIImage(cgImage: pixels, scale: self.traitCollection.displayScale, orientation: .up)
        }
    }

    /// Throws for a bundled image the app was built without.
    func setSource(_ next: KuitoImageSource?) throws {
        guard next != source else { return }

        if case .bundled(let name) = next {
            guard let bundled = UIImage(named: name) else { throw KuitoImageError.notBundled(name) }

            return showBundled(bundled, as: next)
        }

        source = next
        loading?.cancel()
        loading = nil
        decoded = nil
        requested = false
        inFlight = false
        image = nil
        placeholder.alpha = 1

        guard case .remote = next else { return }

        emit?("loadstart", nil)

        // A new view has no size until the layout pass that follows the props.
        if bounds.isEmpty { setNeedsLayout() } else { load() }
    }

    /// Loads once the view has its size, and again, keeping the image shown,
    /// when it grows past what the decode covers.
    override func layoutSubviews() {
        super.layoutSubviews()

        guard case .remote = source else { return }

        if !requested || !inFlight && outgrown { load() }
    }

    /// The view's size in pixels; nil, the full image, for `none`, which shows
    /// the image at its own size, and before the view has a size.
    private var target: CGSize? {
        let scale = traitCollection.displayScale

        guard contentMode != .center, !bounds.isEmpty, scale > 0 else { return nil }

        return CGSize(width: (bounds.width * scale).rounded(.up), height: (bounds.height * scale).rounded(.up))
    }

    /// The view grew past the decode on screen. One with no size shows
    /// nothing, so it keeps the decode it has.
    private var outgrown: Bool {
        guard let decoded, contentMode == .center || !bounds.isEmpty else { return false }

        return !decoded.covers(target)
    }

    /// The first load of a source emits its events; a reload for a larger
    /// size replaces the image without them.
    private func load() {
        guard case .remote(let url, let headers) = source, let current = source else { return }

        let first = decoded == nil
        let target = target

        requested = true
        inFlight = true
        loading?.cancel()
        loading = Task { [weak self] in
            do {
                let loaded = try await KuitoImageLoader.shared.image(
                    for: url, headers: headers, policy: self?.cachePolicy ?? .memoryDisk, fitting: target
                )

                guard let self, !Task.isCancelled, self.source == current else { return }

                self.inFlight = false
                self.decoded = loaded

                if first {
                    self.show(loaded.image)
                    self.emit?("load", KuitoImageSizePayload(width: Double(loaded.pixelSize.width), height: Double(loaded.pixelSize.height)))
                } else {
                    self.replace(with: loaded.image)
                }

                // The view grew while it loaded.
                if self.outgrown { self.load() }
            } catch {
                guard let self, !Task.isCancelled, self.source == current else { return }

                self.inFlight = false

                guard first else { return }

                self.emit?("error", KuitoErrorPayload(error: error.localizedDescription))
            }

            if first { self?.emit?("loadend", nil) }
        }
    }

    /// Shown in the same frame, with no placeholder; the load events follow
    /// as a URL's do, after the props are applied.
    private func showBundled(_ bundled: UIImage, as next: KuitoImageSource?) {
        source = next
        loading?.cancel()
        image = bundled
        applyTint()
        placeholder.alpha = 0

        loading = Task { [weak self] in
            guard let self, !Task.isCancelled, self.source == next else { return }

            let size = KuitoImageLoader.pixelSize(of: bundled)

            self.emit?("loadstart", nil)
            self.emit?("load", KuitoImageSizePayload(width: Double(size.width), height: Double(size.height)))
            self.emit?("loadend", nil)
        }
    }

    private func show(_ loaded: UIImage) {
        let apply = {
            self.image = loaded
            self.applyTint()
            self.placeholder.alpha = 0
        }

        guard transitionDuration > 0 else { return apply() }

        UIView.transition(
            with: self,
            duration: transitionDuration,
            options: [.transitionCrossDissolve, .allowUserInteraction],
            animations: apply
        )
    }

    private func replace(with larger: UIImage) {
        image = larger
        applyTint()
    }

    private func applyTint() {
        guard let current = image else { return }

        if let tint {
            image = current.withRenderingMode(.alwaysTemplate)
            tintColor = tint
        } else {
            image = current.withRenderingMode(.automatic)
        }
    }
}
