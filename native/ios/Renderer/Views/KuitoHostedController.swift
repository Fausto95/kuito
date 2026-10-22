import UIKit

extension UIView {
    /// Keeps `controller` a child of the nearest view controller above this
    /// view, with its view filling this one. UIKit containers (navigation,
    /// tab bar) only forward appearance, safe area and transitions to children
    /// of the view controller hierarchy. Call from didMoveToSuperview and
    /// didMoveToWindow: the chain above may be incomplete at the first.
    func hostController(_ controller: UIViewController) {
        guard superview != nil else { return releaseController(controller) }

        guard let parent = nearestController(), controller.parent !== parent else { return }

        releaseController(controller)
        parent.addChild(controller)
        controller.view.frame = bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(controller.view)
        controller.didMove(toParent: parent)
    }

    private func releaseController(_ controller: UIViewController) {
        guard controller.parent != nil else { return }

        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
    }

    private func nearestController() -> UIViewController? {
        var current = next

        while let responder = current {
            if let controller = responder as? UIViewController { return controller }

            current = responder.next
        }

        return nil
    }
}
