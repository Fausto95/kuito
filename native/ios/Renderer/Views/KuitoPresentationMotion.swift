import QuartzCore
import UIKit

/// A sheet's motion source (docs/motion.md#motion-sources): how tall it
/// stands on screen and where that is between its lowest snap point (0)
/// and its highest (1), read from the presented view's presentation layer on
/// display frames while it may move: from when it presents, is touched or
/// snaps until it has been still for `restAfter`.
@MainActor
final class KuitoSheetMotion {
    /// The sheet's height over the screen's bottom and its snap points' span; nil while not presented. Tests set their own.
    var measure: () -> (height: CGFloat, lowest: CGFloat, highest: CGFloat)? = { nil }
    var emit: ((String, (any KuitoEventPayload)?) -> Void)?

    var on = false {
        didSet {
            guard on != oldValue else { return }

            sent = nil

            // The first report waits for a display frame: the batch that asked
            // brings the UI-thread handler after it.
            if on { frames.start() } else { frames.stop() }
        }
    }

    /// Still for this long, two frames at 60 Hz, the sheet is at rest.
    private static let restAfter: CFTimeInterval = 1.0 / 30

    private lazy var frames = KuitoMotionFrames { [weak self] in self?.frame() }
    private var sent: (height: CGFloat, progress: Double)?
    private var moved: CFTimeInterval = 0
    /// Touches down on the sheet: it may move under them however long they hold still.
    var touching = 0

    /// It may move: it presented, snapped or was touched.
    func wake() {
        moved = CACurrentMediaTime()
        if on { frames.start() }
    }

    func frame() {
        guard on else { return }

        guard let position = measure() else { return frames.stop() }

        let span = position.highest - position.lowest
        let progress = span > 0 ? Double((position.height - position.lowest) / span) : 1

        if sent?.height != position.height || sent?.progress != progress {
            sent = (position.height, progress)
            moved = CACurrentMediaTime()
            emit?("motion", KuitoSheetMotionPayload(height: Double(position.height), progress: progress))
        } else if touching == 0, CACurrentMediaTime() - moved >= Self.restAfter {
            frames.stop()
        }
    }
}

/// Wakes a sheet's motion on every touch without taking any: it never recognizes.
@MainActor
final class KuitoSheetTouches: UIGestureRecognizer {
    weak var motion: KuitoSheetMotion?

    init(_ motion: KuitoSheetMotion) {
        self.motion = motion
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        motion?.touching += touches.count
        motion?.wake()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        lift(touches)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        lift(touches)
    }

    private func lift(_ touches: Set<UITouch>) {
        guard let motion else { return }

        motion.touching = max(motion.touching - touches.count, 0)
        motion.wake()

        if motion.touching == 0 { state = .failed }
    }

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

/// A stack's motion source: how far a back swipe has taken its top screen
/// away, 0 to 1, read from the outgoing screen's presentation layer on each
/// display frame of a pop, the edge swipe's included; 0 once none runs.
@MainActor
final class KuitoBackMotion {
    /// The outgoing screen's progress off the stack; nil while no pop runs. Tests set their own.
    var measure: () -> CGFloat? = { nil }
    var emit: ((String, (any KuitoEventPayload)?) -> Void)?

    var on = false {
        didSet {
            guard on != oldValue else { return }

            sent = nil

            if on { frames.start() } else { frames.stop() }
        }
    }

    private lazy var frames = KuitoMotionFrames { [weak self] in self?.frame() }
    private var sent: CGFloat?

    /// A pop may have started: the edge swipe began, or the stack shows another screen.
    func wake() {
        if on { frames.start() }
    }

    func frame() {
        guard on else { return }

        let progress = measure()

        if progress ?? 0 != sent {
            sent = progress ?? 0
            emit?("motion", KuitoBackMotionPayload(progress: Double(progress ?? 0)))
        }

        if progress == nil { frames.stop() }
    }
}

/// A display link that calls `tick` each frame while started; it holds its
/// owner weakly, as a display link retains its target.
@MainActor
final class KuitoMotionFrames: NSObject {
    private let tick: () -> Void
    private var link: CADisplayLink?

    init(_ tick: @escaping () -> Void) {
        self.tick = tick
    }

    func start() {
        guard link == nil else { return }

        let link = CADisplayLink(target: KuitoMotionFramesTarget(self), selector: #selector(KuitoMotionFramesTarget.frame(_:)))

        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    fileprivate func frame() {
        tick()
    }
}

@MainActor
private final class KuitoMotionFramesTarget: NSObject {
    private weak var frames: KuitoMotionFrames?

    init(_ frames: KuitoMotionFrames) {
        self.frames = frames
    }

    @objc func frame(_ link: CADisplayLink) {
        guard let frames else { return link.invalidate() }

        frames.frame()
    }
}
