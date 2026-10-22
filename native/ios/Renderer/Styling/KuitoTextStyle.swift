import UIKit

struct KuitoTextStyle {
    var fontSize: CGFloat = 17
    /// 100 to 900, as CSS numbers it.
    var weight = 400
    var family: String?
    var italic = false
    var lineHeight: CGFloat?
    var letterSpacing: CGFloat = 0
    var alignment: NSTextAlignment = .natural
    var textTransform = "none"
    var color: UIColor?
    /// The most the user's text size enlarges `fontSize` by; no limit when nil.
    var maxFontScale: CGFloat?

    /// The font at the user's text size: UIFontMetrics scales it as it does
    /// body text, up to `maxFontScale` times `fontSize`.
    func font(scaledFor traits: UITraitCollection) -> UIFont {
        // A maximum of 0 is none.
        UIFontMetrics.default.scaledFont(for: font, maximumPointSize: maxFontScale.map { fontSize * $0 } ?? 0, compatibleWith: traits)
    }

    /// A bundled or loaded family's nearest face (KuitoFonts); otherwise the
    /// system's font, weighted and slanted by traits.
    private var font: UIFont {
        if let family, let font = KuitoFonts.shared.font(family: family, weight: weight, italic: italic, size: fontSize) {
            return font
        }

        let systemWeight = Self.weights[weight] ?? .regular
        var descriptor = (family.flatMap { UIFont(name: $0, size: fontSize) } ?? .systemFont(ofSize: fontSize, weight: systemWeight)).fontDescriptor
        if family != nil {
            descriptor = descriptor.addingAttributes([.traits: [UIFontDescriptor.TraitKey.weight: systemWeight]])
        }
        if italic, let slanted = descriptor.withSymbolicTraits(descriptor.symbolicTraits.union(.traitItalic)) { descriptor = slanted }
        return UIFont(descriptor: descriptor, size: fontSize)
    }

    func transformed(_ text: String) -> String {
        switch textTransform {
        case "uppercase": return text.uppercased()
        case "lowercase": return text.lowercased()
        case "capitalize": return text.capitalized
        default: return text
        }
    }

    func attributed(_ text: String, scaledFor traits: UITraitCollection) -> NSAttributedString {
        let font = font(scaledFor: traits)
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = alignment
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .kern: letterSpacing, .paragraphStyle: paragraph]
        if let lineHeight {
            paragraph.minimumLineHeight = lineHeight
            paragraph.maximumLineHeight = lineHeight
            attributes[.baselineOffset] = (lineHeight - font.lineHeight) / 4
        }
        if let color { attributes[.foregroundColor] = color }
        return NSAttributedString(string: transformed(text), attributes: attributes)
    }

    private static let weights: [Int: UIFont.Weight] = [100: .ultraLight, 200: .thin, 300: .light, 400: .regular,
                                                        500: .medium, 600: .semibold, 700: .bold, 800: .heavy,
                                                        900: .black]

    /// fontWeight's values (the manifest's) as weights; normal when reset.
    static let weightsByName: [String: Int] = [
        "normal": 400, "bold": 700, "100": 100, "200": 200, "300": 300, "400": 400, "500": 500, "600": 600,
        "700": 700, "800": 800, "900": 900,
    ]
}
