import UIKit

/// An SF Symbol by name, at a point size and weight, in its tint (black by
/// default, as Text is). The kernel sizes the view to a square of the point
/// size unless the app sizes it (src/runtime/intrinsic-size.ts); the symbol
/// fits inside, as a tab bar fits its icons.
@MainActor
final class KuitoSymbolView: UIImageView, KuitoTintable {
    static let weights: [String: UIImage.SymbolWeight] = [
        "ultralight": .ultraLight,
        "thin": .thin,
        "light": .light,
        "regular": .regular,
        "medium": .medium,
        "semibold": .semibold,
        "bold": .bold,
        "heavy": .heavy,
        "black": .black,
    ]

    private static let defaultSize: CGFloat = 24

    private var name: String?
    private var pointSize = defaultSize
    private var weight = UIImage.SymbolWeight.regular

    var tint: UIColor? {
        didSet { tintColor = tint ?? .black }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentMode = .scaleAspectFit
        tintColor = .black
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Throws for a name no SF Symbol has.
    func setName(_ next: String?) throws {
        if let next, UIImage(systemName: next) == nil {
            throw KuitoRenderError.Rejection("no SF Symbol is named \(next)")
        }

        name = next
        draw()
    }

    func setSize(_ size: CGFloat?) {
        pointSize = size.flatMap { $0 > 0 ? $0 : nil } ?? Self.defaultSize
        draw()
    }

    func setWeight(_ next: UIImage.SymbolWeight) {
        weight = next
        draw()
    }

    private func draw() {
        let configuration = UIImage.SymbolConfiguration(pointSize: pointSize, weight: weight)

        image = name.flatMap { UIImage(systemName: $0, withConfiguration: configuration) }
    }
}
