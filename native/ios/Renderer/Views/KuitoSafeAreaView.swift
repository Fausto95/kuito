import UIKit

/// SafeAreaView: pads its content by the part of it the system covers. UIKit
/// reports each view's own overlap with the safe area, so only edges that
/// actually touch the status bar, notch or home indicator are padded.
@MainActor
final class KuitoSafeAreaView: UIView, KuitoStyled {
    /// The style whose safe-area inset this view sets.
    weak var style: KuitoViewStyle? {
        // UIKit may report the insets before the renderer assigns the style.
        didSet { updateInset() }
    }

    func style(_ style: KuitoViewStyle, in _: KuitoTreeLinks) {
        self.style = style
    }

    var edges = Set(KuitoEdgeValue.allCases) {
        didSet { updateInset() }
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        updateInset()
    }

    private func updateInset() {
        let safe = safeAreaInsets
        let inset = UIEdgeInsets(
            top: edges.contains(.top) ? safe.top : 0,
            left: edges.contains(.left) ? safe.left : 0,
            bottom: edges.contains(.bottom) ? safe.bottom : 0,
            right: edges.contains(.right) ? safe.right : 0
        )

        guard let style, style.safeAreaInset != inset else { return }

        style.safeAreaInset = inset
        style.applyInset()
    }
}
