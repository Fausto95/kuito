import UIKit

/// Shared elements (docs/navigation.md#shared-elements): a view on the screen
/// a stack leaves flies to the view with the same sharedId on the screen it
/// shows. A snapshot of the leaving view moves from its frame to the arriving
/// view's frame alongside UIKit's push or pop, so an interactive edge swipe
/// drives it too; both views hide while it flies, and show as they were when
/// the transition ends or is cancelled.
@MainActor
enum KuitoSharedTransition {
    static func run(
        alongside coordinator: UIViewControllerTransitionCoordinator,
        sharedElements: @escaping (UIView) -> [String: UIView]
    ) {
        guard let from = coordinator.viewController(forKey: .from), let to = coordinator.viewController(forKey: .to) else {
            return
        }

        var flights: [(snapshot: UIView, hidden: [(view: UIView, alpha: CGFloat)])] = []

        coordinator.animate(alongsideTransition: { context in
            let container = context.containerView

            // The arriving screen lays out its subtree before its frames are read.
            to.view.layoutIfNeeded()

            let targets = sharedElements(to.view)

            for (sharedId, source) in sharedElements(from.view) {
                guard let target = targets[sharedId], let snapshot = source.snapshotView(afterScreenUpdates: false) else {
                    continue
                }

                // Where each view rests, whatever offset UIKit's transition gives its screen.
                let start = resting(source, on: from.view, in: container)
                let end = resting(target, on: to.view, in: container)

                let hidden = [(source, source.alpha), (target, target.alpha)]

                UIView.performWithoutAnimation {
                    snapshot.frame = start
                    container.addSubview(snapshot)
                    hidden.forEach { $0.0.alpha = 0 }
                }

                snapshot.frame = end
                flights.append((snapshot, hidden))
            }
        }, completion: { _ in
            for flight in flights {
                flight.snapshot.removeFromSuperview()
                flight.hidden.forEach { $0.view.alpha = $0.alpha }
            }
        })
    }

    /// `view`'s frame in the container with its screen at rest: a stack's
    /// screens fill the container when no transition moves them.
    private static func resting(_ view: UIView, on screen: UIView, in container: UIView) -> CGRect {
        view.convert(view.bounds, to: screen).offsetBy(dx: container.bounds.minX, dy: container.bounds.minY)
    }
}
