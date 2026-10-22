import UIKit

/// The launch screen, kept over the app until it hides (docs/splash.md). The
/// shell installs the same storyboard iOS launched with over its root view
/// before the first frame, so the system's launch screen hands over with no
/// gap, and it goes in the frame that shows the app's first screen unless the
/// app keeps it. `Splash` reads and hides it; the state JavaScript reads
/// synchronously is behind a lock, the rest is main-thread only.
final class KuitoSplash {
    static let shared = KuitoSplash()

    /// What Info.plist names the launch storyboard src/cli/splash-screens.ts generates.
    private static let storyboard = "Splash"
    // The storyboard's tags for its logo and brand.
    private static let logoTag = 1
    private static let brandTag = 2
    private static let fadeDuration = 0.25

    private let lock = NSLock()
    private var visible = false
    private var keep = false
    private var current: Layout?

    private var overlay: UIView?
    private var fading = false
    private var waiting: [(fade: Bool, done: () -> Void)] = []
    private var hasPendingFrames: () -> Bool = { false }
    private var observers: [UUID: () -> Void] = [:]

    var isVisible: Bool { lock.withLock { visible } }
    /// The logo's and brand's frames in the host, in points.
    struct Layout {
        let logo: CGRect
        let brand: CGRect?
    }

    var layout: Layout? { lock.withLock { current } }

    func preventAutoHide() {
        lock.withLock { keep = true }
    }

    /// Covers `host` with the launch screen, when the app has one.
    /// `hasPendingFrames` says whether batches the app sent wait for a frame.
    @MainActor
    func install(in host: UIView, hasPendingFrames: @escaping () -> Bool) {
        guard Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String == Self.storyboard,
              let view = UIStoryboard(name: Self.storyboard, bundle: .main).instantiateInitialViewController()?.view
        else { return }

        install(view, in: host, hasPendingFrames: hasPendingFrames)
    }

    /// Covers `host` with `view`, the launch screen's drawing.
    @MainActor
    func install(_ view: UIView, in host: UIView, hasPendingFrames: @escaping () -> Bool) {
        view.frame = host.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(view)
        overlay = view
        self.hasPendingFrames = hasPendingFrames
        lock.withLock { visible = true }
        measure()
    }

    /// The host laid out: the logo and brand moved with it.
    @MainActor
    func measure() {
        guard let overlay, let host = overlay.superview else { return }

        overlay.layoutIfNeeded()

        let frame = { (tag: Int) in overlay.viewWithTag(tag).map { host.convert($0.bounds, from: $0) } }
        let layout = frame(Self.logoTag).map { Layout(logo: $0, brand: frame(Self.brandTag)) }

        lock.withLock { current = layout }
    }

    /// The app's first frame with content arrived: the first batch in which
    /// the renderer created a view, or set a prop of one (its `onUpdate`).
    /// It hides with that frame, unless the app keeps it.
    @MainActor
    func firstFrame() {
        if !lock.withLock({ keep }) { hide(fade: false) {} }
    }

    /// Hides once the batches sent before this call are on screen; `done` runs when it is gone.
    @MainActor
    func hide(fade: Bool, done: @escaping () -> Void) {
        guard overlay != nil else { return done() }

        waiting.append((fade, done))

        if !hasPendingFrames() { framesCommitted() }
    }

    /// The shell applied every batch it had: a waiting hide goes in this frame.
    @MainActor
    func framesCommitted() {
        guard let overlay, !waiting.isEmpty, !fading else { return }

        guard waiting.contains(where: \.fade) else { return remove(overlay) }

        fading = true
        UIView.animate(withDuration: Self.fadeDuration, delay: 0, options: [.curveEaseOut]) {
            overlay.alpha = 0
        } completion: { _ in
            self.remove(overlay)
        }
    }

    /// Removes it at once: the app failed before its first screen, or waits
    /// for a dev server, and what the shell shows instead must not stay hidden.
    @MainActor
    func dismiss() {
        guard let overlay else { return }

        remove(overlay)
    }

    @MainActor
    private func remove(_ view: UIView) {
        view.removeFromSuperview()
        overlay = nil
        fading = false
        lock.withLock { visible = false }

        let done = waiting

        waiting = []
        done.forEach { $0.done() }
        observers.values.forEach { $0() }
    }

    /// Calls `observer` once the splash is gone; at once when it already is.
    @MainActor
    func observe(_ observer: @escaping () -> Void) -> UUID {
        let token = UUID()

        if overlay == nil { observer() } else { observers[token] = observer }

        return token
    }

    @MainActor
    func cancel(_ token: UUID) {
        observers[token] = nil
    }
}

