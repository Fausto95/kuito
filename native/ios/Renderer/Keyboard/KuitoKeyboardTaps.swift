import UIKit

/// ScrollView's keyboardShouldPersistTaps. While the keyboard shows, a tap
/// outside the focused input dismisses it: always (`never`, the default; the
/// tap goes no further), only when nothing that handles taps was hit
/// (`handled`), or never (`always`).
@MainActor
final class KuitoKeyboardTaps: UITapGestureRecognizer, UIGestureRecognizerDelegate {
    var mode = "never" {
        didSet {
            // Held back until the tap fails, so a dismissing tap reaches nothing.
            delaysTouchesBegan = mode == "never"
            cancelsTouchesInView = mode == "never"
        }
    }

    private weak var keyboard: KuitoKeyboard?

    static func of(_ scroll: UIScrollView, keyboard: KuitoKeyboard) -> KuitoKeyboardTaps {
        if let existing = scroll.gestureRecognizers?.compactMap({ $0 as? KuitoKeyboardTaps }).first { return existing }

        let taps = KuitoKeyboardTaps(keyboard: keyboard)

        scroll.addGestureRecognizer(taps)

        return taps
    }

    private init(keyboard: KuitoKeyboard) {
        self.keyboard = keyboard
        super.init(target: nil, action: nil)
        addTarget(self, action: #selector(tapped))
        delegate = self
        mode = "never"
    }

    func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard mode != "always", keyboard?.frame != nil, let focused = keyboard?.focused else { return false }

        return touch.view.map { !$0.isDescendant(of: focused) } ?? true
    }

    func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }

    @objc private func tapped() {
        guard let view else { return }

        if mode == "handled", Self.handles(view.hitTest(location(in: view), with: nil), within: view) { return }

        view.window?.endEditing(true)
    }

    /// Whether a pressable, control or input is at or above the hit view.
    private static func handles(_ hit: UIView?, within scroll: UIView) -> Bool {
        var current = hit

        while let view = current, view !== scroll {
            // A multi-line field is a UITextView, which is no UIControl.
            if view is UIControl || view is KuitoPressableView || view is KuitoTextInput { return true }

            current = view.superview
        }

        return false
    }
}
