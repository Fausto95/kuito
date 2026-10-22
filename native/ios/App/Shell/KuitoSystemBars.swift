import UIKit

/// The system chrome around the app: the status bar, the home indicator and
/// the root view's color. `SystemUI` sets it; the shell's root view
/// controller, which UIKit asks, reads it and applies each change. Main
/// thread only. It outlives runtimes, so a reload resets it.
final class KuitoSystemBars {
    static let shared = KuitoSystemBars()

    /// The status bar as kuito.config.ts launched the app; `default` is that style.
    private(set) var launchStatusBarStyle = UIStatusBarStyle.default
    private(set) var launchStatusBarHidden = false

    var statusBarStyle = UIStatusBarStyle.default
    var statusBarHidden = false
    var statusBarAnimation = UIStatusBarAnimation.fade
    var homeIndicatorAutoHidden = false
    /// Edge swipes reach the app first. SystemBars' `immersive` sets it with
    /// the bars it hides; JS resolves those, so nothing here overrides them.
    var screenEdgesDeferred = false
    /// A CSS hex color; nil for the shell's own.
    var backgroundColor: String?

    /// The shell applies the state, animating the status bar or not.
    var onChange: ((_ animated: Bool) -> Void)?

    var deferredEdges: UIRectEdge { screenEdgesDeferred ? .all : [] }

    func changed(animated: Bool = false) {
        onChange?(animated)
    }

    /// The shell, before the runtime starts.
    func launched(statusBarStyle style: UIStatusBarStyle, hidden: Bool) {
        launchStatusBarStyle = style
        launchStatusBarHidden = hidden
        statusBarStyle = style
        statusBarHidden = hidden
    }

    func reset() {
        statusBarStyle = launchStatusBarStyle
        statusBarHidden = launchStatusBarHidden
        statusBarAnimation = .fade
        homeIndicatorAutoHidden = false
        screenEdgesDeferred = false
        backgroundColor = nil
        changed()
    }
}
