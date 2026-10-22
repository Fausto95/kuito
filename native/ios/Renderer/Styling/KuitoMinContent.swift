import CoreText
import UIKit

/// A label's min-content width: its widest word. A shrinking row asks for it
/// several times a pass, and it stays the same until the label's text or
/// font changes, so it is measured once and kept. KuitoViewStyle.remeasure,
/// which every text, typography and Dynamic Type change goes through,
/// forgets it; color and alignment keep it.
@MainActor
final class KuitoMinContent {
    private var width: CGFloat?
    /// How many times the width was measured rather than reused.
    private(set) var measurements = 0

    /// Controls and text without words have no narrower form.
    func width(of view: UIView) -> CGFloat {
        guard let label = view as? UILabel else { return .greatestFiniteMagnitude }

        if let width { return width }

        measurements += 1

        let measured = label.attributedText.flatMap(Self.widestWord) ?? .greatestFiniteMagnitude

        width = measured

        return measured
    }

    func forget() {
        width = nil
    }

    /// The widest word, each measured as it would be alone, from one
    /// typesetter over the whole text: no substring or attributed string per
    /// word. Nil when the text has no words.
    nonisolated static func widestWord(_ text: NSAttributedString) -> CGFloat? {
        guard text.length > 0 else { return nil }

        let typesetter = CTTypesetterCreateWithAttributedString(text)
        var widest: CGFloat = 0

        (text.string as NSString).enumerateSubstrings(
            in: NSRange(location: 0, length: text.length),
            options: [.byWords, .substringNotRequired]
        ) { _, range, _, _ in
            let line = CTTypesetterCreateLine(typesetter, CFRange(location: range.location, length: range.length))

            widest = max(widest, ceil(CTLineGetTypographicBounds(line, nil, nil, nil)))
        }

        return widest > 0 ? widest : nil
    }
}
