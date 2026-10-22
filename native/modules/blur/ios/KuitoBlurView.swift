import UIKit

/// `Blur` in native/modules/blur/blur.ts: a plain view laid out by the
/// engine as a Box, whose first subview is a UIVisualEffectView of its
/// material filling it. The renderer places the children above it, as it
/// places them above any subview of a view's own. Its props are defined
/// here, beside the view, so the renderer tests reach them without the
/// generated spec.
final class KuitoBlurView: UIView, KuitoNativeView {
    static func define(_ view: KuitoViewDefinition<KuitoBlurView>) {
        view.prop("material") { (blur, value: Material?) in blur.style = (value ?? .regular).style }
    }

    enum Material: String, Decodable {
        case ultraThin, thin, regular, thick, chrome

        var style: UIBlurEffect.Style {
            switch self {
            case .ultraThin: .systemUltraThinMaterial
            case .thin: .systemThinMaterial
            case .regular: .systemMaterial
            case .thick: .systemThickMaterial
            case .chrome: .systemChromeMaterial
            }
        }
    }

    private let effect = UIVisualEffectView()

    /// UIBlurEffect keeps no style of its own to read back.
    private(set) var style: UIBlurEffect.Style = .systemMaterial {
        didSet { effect.effect = UIBlurEffect(style: style) }
    }

    init(events: KuitoViewEvents) {
        super.init(frame: .zero)
        effect.effect = UIBlurEffect(style: style)
        addSubview(effect)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        effect.frame = bounds
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }
}
