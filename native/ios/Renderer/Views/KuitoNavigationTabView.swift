import UIKit

/// NavigationTab: one tab of a NavigationTabs. It fills its view controller's
/// view and lays out its child, the tab's NavigationStack, as a root of its
/// own. The stack's screens keep clear of the tab bar through the safe area.
@MainActor
final class KuitoNavigationTabView: UIView, KuitoPage {
    weak var layout: KuitoLayoutNode?
    /// Set while the tab is in a tab bar; the tab bar owns the controller.
    weak var controller: KuitoNavigationTabController?

    var title: String? {
        didSet { controller?.updateItem() }
    }

    var emit: ((String, (any KuitoEventPayload)?) -> Void)?

    /// The image the tab bar shows: an SF Symbol, or a loaded image icon.
    var icon: UIImage? {
        didSet { controller?.updateItem() }
    }

    private var source: URL?
    private var loading: Task<Void, Never>?

    /// Loads an image icon; nil drops one, cancelling its load.
    func load(icon url: URL?) {
        guard url != source else { return }

        source = url
        loading?.cancel()
        loading = nil

        guard let url else { return }

        icon = nil
        loading = Task { [weak self] in
            do {
                let image = try await KuitoImageLoader.shared.image(for: url, headers: [:], policy: .memoryDisk, fitting: nil).image

                guard let self, !Task.isCancelled, self.source == url else { return }

                self.icon = Self.barIcon(image)
            } catch {
                guard let self, !Task.isCancelled, self.source == url else { return }

                self.emit?("error", KuitoErrorPayload(error: error.localizedDescription))
            }
        }
    }

    /// Fitted to the 25-point square of an SF Symbol in a tab bar, which shows
    /// an image at its own size, and drawn as a template so the bar tints it.
    private static func barIcon(_ image: UIImage) -> UIImage {
        let side: CGFloat = 25
        let fit = min(side / image.size.width, side / image.size.height)
        let size = CGSize(width: image.size.width * fit, height: image.size.height * fit)

        return UIGraphicsImageRenderer(size: size)
            .image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
            .withRenderingMode(.alwaysTemplate)
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        guard let layout, bounds.width > 0 else { return }

        layout.calculate(withWidth: bounds.width, height: bounds.height, scale: traitCollection.displayScale)
        layout.applyFramesToChildren()
    }
}

/// Shows a tab in a UITabBarController, under its tab bar item.
@MainActor
final class KuitoNavigationTabController: UIViewController {
    /// Not `tab`: UIViewController has one since iOS 18.
    let page: KuitoNavigationTabView

    init(tab: KuitoNavigationTabView) {
        self.page = tab
        super.init(nibName: nil, bundle: nil)
        tab.controller = self
        updateItem()
        // Load now so the tab's stack is in this controller's view from the
        // start and attaches to it before the tab is first shown.
        loadViewIfNeeded()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func loadView() {
        let host = UIView()

        host.backgroundColor = .systemBackground
        page.frame = host.bounds
        page.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(page)
        view = host
    }

    func updateItem() {
        tabBarItem.title = page.title
        tabBarItem.image = page.icon
    }
}
