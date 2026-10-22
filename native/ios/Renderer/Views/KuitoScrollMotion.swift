import QuartzCore
import UIKit

/// A scrolling view's motion source (docs/motion.md#motion-sources): while the
/// app asks for it, every move sends where the view is in its scroll range,
/// how fast it moves and how far past an end it is pulled. A display frame
/// that finds it still for `restAfter` sends it again at rest, velocity 0, so
/// a finger held still or a fling that ends leaves no stale speed behind.
/// Turned on, it first reports on the next display frame: the batch that
/// asked brings the UI-thread handler after its views.
@MainActor
final class KuitoScrollMotion {
    /// Where the view is along its axis, past its range while it bounces, and that range.
    typealias Position = () -> (offset: CGFloat, range: ClosedRange<CGFloat>)

    var emit: ((String, (any KuitoEventPayload)?) -> Void)?
    /// Display time in seconds; tests set their own.
    var clock: () -> CFTimeInterval = CACurrentMediaTime

    var on = false {
        didSet {
            guard on != oldValue else { return }

            velocity = 0
            last = (position().offset, clock())
            reporting = on

            if on { startFrames() } else { stopFrames() }
        }
    }

    /// Still for this long, two frames at 60 Hz, it is at rest: a scroll view may
    /// move on fewer display frames than the link ticks on, as at 120 Hz.
    private static let restAfter: CFTimeInterval = 1.0 / 30

    private let position: Position
    private var last: (offset: CGFloat, time: CFTimeInterval)
    private var velocity: Double = 0
    /// Turned on and not reported yet.
    private var reporting = false
    private var link: CADisplayLink?

    init(position: @escaping Position) {
        self.position = position
        last = (0, 0)
    }

    /// The view scrolled: from scrollViewDidScroll.
    func scrolled() {
        guard on else { return }

        let offset = position().offset
        let now = clock()
        let elapsed = now - last.time

        // A move from rest has no speed yet: the time since says how long it rested.
        velocity = elapsed > 0 && elapsed < Self.restAfter ? Double((offset - last.offset) / CGFloat(elapsed)) : 0
        last = (offset, now)
        reporting = false
        send()
        startFrames()
    }

    /// A display frame while it moves: one that finds it still for `restAfter` brings it to rest.
    func frame() {
        guard on else { return }

        guard !reporting else {
            reporting = false
            stopFrames()
            return send()
        }

        let now = clock()

        guard now - last.time >= Self.restAfter else { return }

        stopFrames()
        last.time = now
        velocity = 0
        send()
    }

    private func send() {
        emit?("motion", payload())
    }

    private func payload() -> KuitoScrollMotionPayload {
        let (offset, range) = position()
        let within = min(max(offset, range.lowerBound), range.upperBound)

        return KuitoScrollMotionPayload(offset: Double(within), velocity: velocity, overscroll: Double(offset - within))
    }

    private func startFrames() {
        guard link == nil else { return }

        let link = CADisplayLink(target: KuitoScrollMotionFrames(self), selector: #selector(KuitoScrollMotionFrames.tick(_:)))

        link.add(to: .main, forMode: .common)
        self.link = link
    }

    private func stopFrames() {
        link?.invalidate()
        link = nil
    }
}

/// The display link's target: it holds the link's owner weakly, as a display link retains its target.
@MainActor
private final class KuitoScrollMotionFrames: NSObject {
    private weak var motion: KuitoScrollMotion?

    init(_ motion: KuitoScrollMotion) {
        self.motion = motion
    }

    @objc func tick(_ link: CADisplayLink) {
        guard let motion else { return link.invalidate() }

        motion.frame()
    }
}
