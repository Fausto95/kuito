import UIKit

/// Focus order: inputs in the order they appear in Kuito's tree, within the
/// same screen or sheet, skipping hidden and disabled ones.
@MainActor
enum KuitoFocus {
    static func next(after field: UIView) -> UIView? {
        let order = fields(in: container(of: field))

        guard let index = order.firstIndex(where: { $0 === field }), index + 1 < order.count else { return nil }

        return order[index + 1]
    }

    /// The root or sheet holding the view: focus order does not cross between them.
    private static func container(of view: UIView) -> UIView {
        var current = view

        while let parent = current.superview, !(current is KuitoRootView), !(current is KuitoSheetView) {
            current = parent
        }

        return current
    }

    private static func fields(in view: UIView) -> [UIView] {
        guard !view.isHidden, view.alpha > 0 else { return [] }

        if let field = view as? KuitoTextInput { return field.disabled ? [] : [field] }
        // A text field outside Kuito's (a module's view): an input too.
        if let field = view as? UITextField { return field.isEnabled ? [field] : [] }

        return view.subviews.flatMap(fields(in:))
    }
}

extension KuitoTextInput {
    /// The return key, after onSubmit: keep the focus, move it to the
    /// next input (`returnKeyType` next), or hide the keyboard. A
    /// single-line field has no line to add: `newline` keeps the focus too.
    func submitted() {
        guard submitBehavior != "submit", submitBehavior != "newline" else { return }

        if returnKeyType == .next, let next = KuitoFocus.next(after: self) {
            next.becomeFirstResponder()
        } else {
            resignFirstResponder()
        }
    }
}
