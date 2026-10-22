import UIKit

/// The dev shell's look: deep ink surfaces, one electric accent, status colors.
enum KuitoDevTheme {
    static let ink = UIColor(red: 0.04, green: 0.04, blue: 0.07, alpha: 1)
    static let surface = UIColor(red: 0.09, green: 0.09, blue: 0.13, alpha: 1)
    static let raised = UIColor(red: 0.13, green: 0.13, blue: 0.18, alpha: 1)
    static let hairline = UIColor(white: 1, alpha: 0.08)
    static let text = UIColor(white: 0.96, alpha: 1)
    static let muted = UIColor(white: 0.62, alpha: 1)
    static let accent = UIColor(red: 0.49, green: 0.36, blue: 1.0, alpha: 1)
    static let success = UIColor(red: 0.20, green: 0.83, blue: 0.60, alpha: 1)
    static let warning = UIColor(red: 0.98, green: 0.75, blue: 0.14, alpha: 1)
    static let danger = UIColor(red: 0.97, green: 0.44, blue: 0.44, alpha: 1)

    static func font(_ size: CGFloat, _ weight: UIFont.Weight = .regular) -> UIFont {
        .systemFont(ofSize: size, weight: weight)
    }

    static func mono(_ size: CGFloat, _ weight: UIFont.Weight = .medium) -> UIFont {
        .monospacedDigitSystemFont(ofSize: size, weight: weight)
    }

    /// Every glyph the same width, so code and carets line up.
    static func code(_ size: CGFloat, _ weight: UIFont.Weight = .regular) -> UIFont {
        .monospacedSystemFont(ofSize: size, weight: weight)
    }
}
