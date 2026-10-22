import UIKit

/// `Splash` in native/modules/splash/splash.ts, and the view that draws its parts.
final class KuitoSplashModule: SplashSpec {
    private var observation: UUID?

    init(context: KuitoModuleContext) {}

    func layout() -> SplashLayout? {
        KuitoSplash.shared.layout.map { SplashLayout(logo: SplashFrame($0.logo), brand: $0.brand.map(SplashFrame.init)) }
    }

    func visible() -> Bool {
        KuitoSplash.shared.isVisible
    }

    // The splash goes once per launch: observing a splash already gone sets false at once.
    @MainActor func startVisible(_ signal: KuitoSignal<Bool>) {
        observation = KuitoSplash.shared.observe { signal.set(false) }
    }

    @MainActor func stopVisible() {
        observation.map(KuitoSplash.shared.cancel)
        observation = nil
    }

    func preventAutoHide() {
        KuitoSplash.shared.preventAutoHide()
    }

    @MainActor func hide(_ fade: Bool, _ promise: KuitoPromise<Void>) {
        KuitoSplash.shared.hide(fade: fade) { promise.resolve() }
    }

    // iOS has one launch screen, which it caches (docs/splash.md#variants).
    func getVariant() -> String? {
        nil
    }

    @MainActor func setVariant(_ name: String?) throws {
        throw KuitoModuleError(
            "ERR_UNSUPPORTED",
            "iOS shows one launch screen, chosen at build time; splash variants are Android 13 and later")
    }

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoSplashPartView.self) { view in
            view.prop("part") { (part, value: KuitoSplashPartView.Part?) in part.part = value }
        }
    }
}

/// One part of the launch screen, drawn from its asset catalog, so it follows
/// dark mode the way the launch screen does.
final class KuitoSplashPartView: UIImageView, KuitoNativeView {
    enum Part: String, Decodable {
        case background, logo, brand
    }

    var part: Part? {
        didSet {
            backgroundColor = part == .background ? UIColor(named: "SplashBackground") : nil
            image = switch part {
            case .logo: UIImage(named: "SplashLogo")
            case .brand: UIImage(named: "SplashBrand")
            case .background, nil: nil
            }
        }
    }

    init(events: KuitoViewEvents) {
        super.init(frame: .zero)
        contentMode = .scaleToFill
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }
}

private extension SplashFrame {
    init(_ rect: CGRect) {
        self.init(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height)
    }
}
