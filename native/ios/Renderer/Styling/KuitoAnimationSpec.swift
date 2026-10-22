import UIKit

/// A `layout` animation's spec, how a view moves to a new frame: `{type:"timing",duration,easing:[x1,y1,x2,y2],delay}` or
/// `{type:"spring",damping,stiffness,mass,delay}` (milliseconds).
enum KuitoAnimationSpec {
    case timing(duration: TimeInterval, curve: [CGFloat], delay: TimeInterval)
    case spring(damping: CGFloat, stiffness: CGFloat, mass: CGFloat, delay: TimeInterval)

    /// Nil for a timing curve that is not four control-point coordinates.
    init?(_ value: KuitoLayoutAnimationValue) {
        switch value {
        case .timing(let timing):
            guard timing.easing.count == 4 else { return nil }
            self = .timing(duration: timing.duration / 1000, curve: timing.easing.map { CGFloat($0) }, delay: timing.delay / 1000)
        case .spring(let spring):
            self = .spring(damping: CGFloat(spring.damping), stiffness: CGFloat(spring.stiffness),
                           mass: CGFloat(spring.mass), delay: spring.delay / 1000)
        }
    }

    /// One native animator per change; UIKit runs it on the render server.
    func run(_ changes: @escaping () -> Void, completion: (() -> Void)? = nil) -> UIViewPropertyAnimator {
        let animator: UIViewPropertyAnimator
        let delay: TimeInterval
        switch self {
        case let .timing(duration, curve, wait):
            let timing = UICubicTimingParameters(controlPoint1: CGPoint(x: curve[0], y: curve[1]),
                                                 controlPoint2: CGPoint(x: curve[2], y: curve[3]))
            animator = UIViewPropertyAnimator(duration: duration, timingParameters: timing)
            delay = wait
        case let .spring(damping, stiffness, mass, wait):
            let spring = UISpringTimingParameters(mass: mass, stiffness: stiffness, damping: damping, initialVelocity: .zero)
            // The duration is derived from the spring parameters.
            animator = UIViewPropertyAnimator(duration: 0, timingParameters: spring)
            delay = wait
        }
        animator.isUserInteractionEnabled = true
        animator.addAnimations(changes)
        if let completion { animator.addCompletion { _ in completion() } }
        animator.startAnimation(afterDelay: delay)
        return animator
    }
}

/// A layout node's frame animation, which KuitoLayoutNode holds opaquely.
final class KuitoFrameAnimation: NSObject {
    let spec: KuitoAnimationSpec

    init(_ spec: KuitoAnimationSpec) {
        self.spec = spec
    }
}
