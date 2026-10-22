import UIKit

/// The user's Dynamic Type size, which every text's font scales by
/// (UIFontMetrics). The app's category, not a view's traits: a view not yet
/// in a window has none, and text is measured before it is shown.
@MainActor
final class KuitoTextScale {
    private(set) var traits: UITraitCollection
    /// Every text renders and measures again at the new size.
    var changed: (() -> Void)?

    private var observer: NSObjectProtocol?

    init() {
        traits = UITraitCollection(preferredContentSizeCategory: UIApplication.shared.preferredContentSizeCategory)
        observer = NotificationCenter.default.addObserver(
            forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.update(UIApplication.shared.preferredContentSizeCategory) }
        }
    }

    deinit {
        observer.map(NotificationCenter.default.removeObserver)
    }

    func update(_ category: UIContentSizeCategory) {
        guard category != traits.preferredContentSizeCategory else { return }

        traits = UITraitCollection(preferredContentSizeCategory: category)
        changed?()
    }
}
