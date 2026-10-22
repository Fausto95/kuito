import UIKit

/// While the Components panel inspects (docs/devtools.md), a tap anywhere
/// picks the view under it instead of reaching the app.
@MainActor
final class KuitoInspectOverlay: UIView {
    var onPick: ((CGPoint) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = KuitoDevTheme.accent.withAlphaComponent(0.06)
        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        onPick?(tap.location(in: self))
    }
}
