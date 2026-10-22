import UIKit

/// Where a module presents its own view controller: a share sheet, an alert.
enum KuitoPresenter {
    /// The view controller on top of the key window, so it presents over sheets and modals too.
    static func top() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var top = window?.rootViewController

        while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }

        return top
    }
}
