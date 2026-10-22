import UIKit

/// A container's keyboardAvoidance: `padding` pads its bottom by the part of
/// it the keyboard covers; `position` lifts it until its focused input (or,
/// without one, its own bottom) clears the keyboard. Measured against the
/// keyboard's frame, never a guessed offset.
@MainActor
final class KuitoKeyboardAvoider {
    enum Mode: String {
        case padding, position
    }

    let mode: Mode
    private weak var view: UIView?
    private weak var style: KuitoViewStyle?

    init(mode: Mode, view: UIView, style: KuitoViewStyle) {
        self.mode = mode
        self.view = view
        self.style = style
    }

    func apply(keyboardTop: CGFloat, focused: UIView?) {
        guard let view, let style, let window = view.window else { return }

        switch mode {
        case .padding:
            let bottom = view.convert(view.bounds, to: window).maxY

            style.keyboardInset = max(0, bottom - keyboardTop)
            style.applyInset()
        case .position:
            let target = focused.flatMap { $0.isDescendant(of: view) ? $0 : nil }
            let clearance = target == nil ? 0 : KuitoKeyboard.clearance
            // Where the target sits without this view's lift.
            let bottom = (target ?? view).convert((target ?? view).bounds, to: window).maxY + style.keyboardOffset

            let offset = max(0, bottom + clearance - keyboardTop)

            guard offset != style.keyboardOffset else { return }

            style.keyboardOffset = offset
            view.transform = style.transform()
        }
    }

    /// Undoes this avoider's change, for a prop that turns it off.
    func reset() {
        guard let view, let style else { return }

        style.keyboardInset = 0
        style.keyboardOffset = 0
        style.applyInset()
        view.transform = style.transform()
    }
}

extension KuitoScrollable {
    /// Insets the content by the part the keyboard covers, so all of it can
    /// scroll into view, and with `reveal`, scrolls a focused input inside into
    /// view. Only keyboard and focus changes reveal: a later layout pass must
    /// not undo the user's own scrolling. The keyboard owns the scroll view's
    /// contentInset: a list's padding lives in its layout, so the two add up.
    func avoidKeyboard(top: CGFloat, focused: UIView?, reveal: Bool) {
        let scroller = scroller

        guard let window = scroller.window else { return }

        let overlap = automaticallyAdjustsKeyboardInsets && !horizontal
            ? max(0, scroller.convert(scroller.bounds, to: window).maxY - top) : 0
        let inset = UIEdgeInsets(top: flipped ? overlap : 0, left: 0, bottom: flipped ? 0 : overlap, right: 0)

        if scroller.contentInset != inset {
            // A flipped list resting at its start keeps its first rows in view above the keyboard.
            let resting = flipped && scroller.contentOffset.y <= -scroller.contentInset.top + 0.5

            scroller.contentInset = inset
            scroller.verticalScrollIndicatorInsets = inset

            if resting { scroller.contentOffset.y = -overlap }
        }

        guard reveal, overlap > 0, let focused, focused.isDescendant(of: scroller) else { return }

        let clearance = KuitoKeyboard.clearance

        scroller.scrollRectToVisible(focused.convert(focused.bounds, to: scroller).insetBy(dx: 0, dy: -clearance), animated: false)
    }
}
