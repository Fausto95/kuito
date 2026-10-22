import UIKit

/// Why a removed view is still on screen.
enum KuitoExiting {
    /// Its `exit` runs on the UI thread, whose props it takes until `exited`.
    case animated
    /// Its container's transition owns it until the page is off screen.
    case transition
}

/// The renderer's one record of a view: its view, where its children's views
/// go, its role in the tree (layout root, sheet), whether it is leaving, its
/// node in the layout engine, and the style state of props that compose into
/// one UIKit value (transform, text attributes) or need bookkeeping
/// (gestures).
@MainActor
final class KuitoViewStyle {
    /// The Kuito kind, to make the view when a flattened node needs one.
    let kind: String
    /// The app's id for the view, or the kernel's: what errors name it by.
    let label: String
    /// The view's parent in Kuito's tree (0: the root). Not always its layout
    /// node's parent: a page, a sheet or a list row is a layout root of its own.
    var parent: UInt32 = 0
    let layout: KuitoLayoutNode
    /// Nil while the node is flattened (docs/flattening.md). The layout node
    /// points at it weakly; the record owns it.
    var view: UIView? {
        didSet { layout.view = view }
    }
    /// Where its children's views go when that is not the view: a ScrollView's content.
    var content: UIView?
    /// Set for a view that lays out its own subtree: a sheet, a page or a list row.
    var layoutRoot: KuitoLayoutRoot?
    /// Set for a view that shows its children itself (KuitoHost).
    var host: KuitoHost?
    var sheet: KuitoSheetView?
    /// Set once the view has left Kuito's tree but not the screen.
    var exiting: KuitoExiting?
    /// The kind's own props, ahead of the shared tables: a module view's.
    let props: [String: KuitoPropertySetter]
    var translateX: CGFloat = 0, translateY: CGFloat = 0
    var scale: CGFloat = 1, scaleX: CGFloat = 1, scaleY: CGFloat = 1, rotate: CGFloat = 0
    var opacity: CGFloat = 1
    /// Press feedback factors, multiplied into opacity and scale while pressed.
    var pressedOpacity: CGFloat = 1
    var pressedScale: CGFloat = 1

    /// The alpha the view shows: its opacity, dimmed while pressed.
    var effectiveOpacity: CGFloat { opacity * pressedOpacity }
    var cornerRadius: CGFloat = 0
    var overflowHidden = false
    var hasShadow = false
    /// True while the UI thread writes a prop: it applies at once, unanimated.
    var driven = false
    /// The view waits for its exit on the UI thread before it goes, until `exited`.
    var exit = false
    var exited = false
    var gradient: KuitoGradientView?
    var text = KuitoTextStyle()
    /// A label's text before textTransform; restyling re-renders it.
    var labelText = ""
    let minContent = KuitoMinContent()
    lazy var accessibility = KuitoAccessibility()
    /// The view a navigation stack flies to its namesake on the next screen (KuitoSharedTransition).
    var sharedId: String?
    var keyboardAvoider: KuitoKeyboardAvoider?
    /// The part of the view the system covers, for SafeAreaView and a sheet's only view.
    var safeAreaInset = UIEdgeInsets.zero
    /// The part of the view the keyboard covers, for keyboardAvoidance padding.
    var keyboardInset: CGFloat = 0
    /// How far keyboardAvoidance position lifts the view.
    var keyboardOffset: CGFloat = 0
    /// The view's attached gestures; they leave with the view.
    var gestures = KuitoGestureSet()
    private var boundsObservation: NSKeyValueObservation?
    #if DEBUG
        /// Each prop's last value, which a write of the same value wastes (KuitoCost).
        var written: [String: KuitoValue] = [:]
    #endif

    /// The view as errors name it: its kind, label and number.
    func described(_ id: UInt32) -> String {
        "\(kind) \(label) (\(id))"
    }

    init(kind: String, label: String, layout: KuitoLayoutNode, props: [String: KuitoPropertySetter]) {
        self.kind = kind
        self.label = label
        self.layout = layout
        self.props = props
    }

    /// What the leaf measures changed (text, font, a field's typing): its
    /// min-content width is forgotten and the next pass measures it again.
    func remeasure() {
        minContent.forget()
        layout.markContentDirty()
    }

    /// CSS clamps border-radius to half the box (`999px` pills); a CALayer with
    /// a larger radius clips everything, so re-clamp whenever the size changes.
    func applyCornerRadius(to view: UIView) {
        let clamp = { [weak self, weak view] in
            guard let self, let view else { return }
            let radius = min(self.cornerRadius, min(view.bounds.width, view.bounds.height) / 2)
            view.layer.cornerRadius = radius
            self.gradient?.layer.cornerRadius = radius
        }
        clamp()
        boundsObservation = cornerRadius > 0 ? view.layer.observe(\.bounds) { _, _ in
            MainActor.assumeIsolated { clamp() }
        } : nil
    }

    /// Padding the platform adds: the safe area, or the keyboard where it covers more.
    func applyInset() {
        var inset = safeAreaInset

        inset.bottom = max(inset.bottom, keyboardInset)

        guard layout.inset != inset else { return }

        layout.inset = inset
        layout.view?.rootView()?.setNeedsLayout()
    }

    func transform() -> CGAffineTransform {
        let s = scale * pressedScale
        return CGAffineTransform(translationX: translateX, y: translateY - keyboardOffset)
            .rotated(by: rotate * .pi / 180)
            .scaledBy(x: s * scaleX, y: s * scaleY)
    }
}
