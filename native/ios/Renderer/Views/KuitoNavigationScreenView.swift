import UIKit

/// NavigationScreen: one screen of a NavigationStack. The view is the
/// screen's content, so style props (background, padding) apply to it; it
/// fills its view controller's view and lays out its subtree as a root of its
/// own, inset by the safe area so content clears the navigation bar, the tab
/// bar and the home indicator.
@MainActor
final class KuitoNavigationScreenView: UIView, KuitoPage {
    weak var layout: KuitoLayoutNode?
    var emit: ((String, (any KuitoEventPayload)?) -> Void)?
    /// Set while the screen is in a stack; the stack owns the controller.
    weak var controller: KuitoNavigationScreenController?

    var title: String? {
        didSet { controller?.navigationItem.title = title }
    }

    var headerShown = true {
        didSet { if headerShown != oldValue { controller?.showBar(animated: true) } }
    }

    var headerItems: [KuitoHeaderItem] = [] {
        didSet { if headerItems != oldValue { controller?.showItems() } }
    }

    var largeTitle = false {
        didSet { controller?.showLargeTitle() }
    }

    var search: KuitoHeaderSearch? {
        didSet { if search != oldValue { controller?.showSearch() } }
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        guard let layout, bounds.width > 0 else { return }

        layout.inset = safeAreaInsets
        layout.calculate(withWidth: bounds.width, height: bounds.height, scale: traitCollection.displayScale)
        layout.applyFramesToChildren()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        setNeedsLayout()
    }
}

/// Shows a screen in a UINavigationController. Its view is a plain host the
/// screen fills: the screen only references its controller weakly, so the
/// stack and UIKit decide how long a popped screen lives.
@MainActor
final class KuitoNavigationScreenController: UIViewController {
    let screen: KuitoNavigationScreenView
    /// The platform removed the screen (edge swipe, back button) and it
    /// reported `dismiss`; the kernel removes the view next.
    var popped = false
    /// The search text last reported, so focus changes report nothing.
    var searchedText: String?

    init(screen: KuitoNavigationScreenView) {
        self.screen = screen
        super.init(nibName: nil, bundle: nil)
        screen.controller = self
        navigationItem.title = screen.title
        showHeader()
        // Load now so the screen's subtree is in a view controller's view from
        // the start: a stack nested in it can attach to this controller.
        loadViewIfNeeded()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func loadView() {
        let host = UIView()

        // Opaque, as UIKit's push and pop transitions expect.
        host.backgroundColor = .systemBackground
        screen.frame = host.bounds
        screen.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(screen)
        view = host
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Per screen: an animated change follows the push, pop or edge swipe.
        showBar(animated: animated)
    }

    func showBar(animated: Bool) {
        guard let navigation = navigationController, navigation.topViewController === self else { return }

        navigation.setNavigationBarHidden(!screen.headerShown, animated: animated)
    }
}
