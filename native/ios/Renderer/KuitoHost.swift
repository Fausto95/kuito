import UIKit

/// A view that shows its children itself instead of the layout tree placing
/// them as subviews: a list's rows, a navigation stack's screens, a tab bar's
/// tabs, a native module's container (docs/native-renderer.md#hosts). Each
/// child is a layout root of its own; the renderer routes its children's
/// creation, moves and removal here.
@MainActor
protocol KuitoHost: UIView {
    /// `child` joins at `index` (nil appends). `label` is the child's label,
    /// how a list matches the row it asked the kernel for. A child it doesn't
    /// take is an `invalidTree` error.
    func adopt(_ child: UIView, label: String, at index: Int?) throws
    func move(_ child: UIView, to index: Int) throws
    /// `child` leaves the host's children at once; `gone` runs once it is off
    /// screen, after any transition the removal plays.
    func release(_ child: UIView, gone: @escaping () -> Void) throws
    /// Whether releasing `child` now would animate it out: its subtree stays
    /// until `gone`.
    func animatesRemoval(_ child: UIView) -> Bool
}

/// A view that keeps its record or reaches the rest of the tree: the
/// renderer styles it once, when it makes the view.
@MainActor
protocol KuitoStyled: UIView {
    func style(_ style: KuitoViewStyle, in tree: KuitoTreeLinks)
}

/// What a styled view may reach of the renderer's tree.
@MainActor
struct KuitoTreeLinks {
    /// Lays out the screen, or the layout root, around the view.
    let setNeedsLayout: () -> Void
    /// The views inside a root with a sharedId, by it (KuitoSharedTransition).
    let sharedElements: (UIView) -> [String: UIView]
    /// The controller a sheet presents from.
    let presenter: () -> UIViewController?
    /// The record a layout node belongs to: the view a sheet pads.
    let style: (KuitoLayoutNode) -> KuitoViewStyle?
}
