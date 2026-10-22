import QuartzCore
import UIKit

/// keyboard.height (docs/keyboard.md#keyboard): once the app asks, the
/// keyboard's height over the root's bottom goes out as `keyboard.move` on
/// each display frame it changes, as it animates and as a finger drags it
/// down. It is read from a hidden view pinned to the keyboard layout guide:
/// the guide's own frame jumps to where the keyboard ends, while the view's
/// presentation layer moves with the keyboard frame by frame.
@MainActor
final class KuitoKeyboardMotion {
    /// The keyboard's height over the root's bottom this frame; tests set their own.
    lazy var measure: () -> CGFloat = { [unowned self] in
        guard let probe else { return 0 }

        return max((probe.layer.presentation() ?? probe.layer).frame.height, 0)
    }

    var on = false {
        didSet {
            guard on != oldValue else { return }

            sent = nil

            // The first report waits for a display frame: the batch that asked
            // brings the UI-thread handler after it.
            if on {
                pin()
                startFrames()
            } else {
                stopFrames()
            }
        }
    }

    /// Set by the keyboard's notifications: frames stop once it is hidden and reported so.
    var hidden = true {
        didSet { if on, !hidden { startFrames() } }
    }

    private let events: KuitoEventEmitter
    private weak var root: UIView?
    private var probe: UIView?
    private var sent: CGFloat?
    private var link: CADisplayLink?

    init(events: KuitoEventEmitter, root: UIView) {
        self.events = events
        self.root = root
    }

    /// A display frame: a height that changed goes out.
    func frame() {
        guard on else { return }

        let height = measure()

        if height != sent {
            sent = height
            events.emit(0, "keyboard.move", KuitoKeyboardMotionPayload(height: Double(height)))
        }

        if hidden, height == 0 { stopFrames() }
    }

    private func pin() {
        guard probe == nil, let root else { return }

        let probe = UIView()

        probe.isHidden = true
        probe.isUserInteractionEnabled = false
        probe.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(probe)

        // Hidden is 0, not the bottom safe area (iOS 16 keeps the safe area: docs/keyboard.md).
        if #available(iOS 17.0, *) { root.keyboardLayoutGuide.usesBottomSafeArea = false }

        NSLayoutConstraint.activate([
            probe.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            probe.widthAnchor.constraint(equalToConstant: 0),
            probe.topAnchor.constraint(equalTo: root.keyboardLayoutGuide.topAnchor),
            probe.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])
        self.probe = probe
    }

    private func startFrames() {
        guard link == nil else { return }

        let link = CADisplayLink(target: KuitoKeyboardMotionFrames(self), selector: #selector(KuitoKeyboardMotionFrames.tick(_:)))

        link.add(to: .main, forMode: .common)
        self.link = link
    }

    private func stopFrames() {
        link?.invalidate()
        link = nil
    }
}

/// The display link's target: it holds the motion weakly, as a display link retains its target.
@MainActor
private final class KuitoKeyboardMotionFrames: NSObject {
    private weak var motion: KuitoKeyboardMotion?

    init(_ motion: KuitoKeyboardMotion) {
        self.motion = motion
    }

    @objc func tick(_ link: CADisplayLink) {
        guard let motion else { return link.invalidate() }

        motion.frame()
    }
}
