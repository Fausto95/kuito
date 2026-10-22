import UIKit

/// NavigationStack: a UINavigationController whose stack follows the view's
/// NavigationScreen children, bottom to top (docs/navigation.md). Changes
/// apply together after the batch that made them, so a removal and an insert
/// in one batch are one change of order rather than a pop and a push.
@MainActor
final class KuitoNavigationStackView: UIView, KuitoHost, KuitoStyled, UINavigationControllerDelegate {
    private let navigation = KuitoNavigationController()
    /// The screens the kernel has, bottom to top, including any the platform
    /// popped that the kernel has not removed yet.
    private var screens: [KuitoNavigationScreenController] = []
    /// The stack this view last gave UIKit: a screen missing from UIKit's that
    /// is still here was popped by the user.
    private var applied: [UIViewController] = []
    /// Removed screens waiting to leave the screen.
    private var removals: [() -> Void] = []
    private var syncScheduled = false
    /// The shared views inside a screen, by sharedId: the renderer answers.
    var sharedElements: (UIView) -> [String: UIView] = { _ in [:] }
    /// The stack's node, whose direction mirrors the pushes, the pops and the edge swipe.
    private weak var layout: KuitoLayoutNode?
    var emit: ((String, (any KuitoEventPayload)?) -> Void)? {
        didSet { motion.emit = emit }
    }
    /// How far a back swipe has taken the top screen away (docs/motion.md#motion-sources).
    private(set) lazy var motion: KuitoBackMotion = {
        let motion = KuitoBackMotion()

        motion.measure = { [weak self] in self?.popProgress() }

        return motion
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        navigation.delegate = self
        navigation.interactivePopGestureRecognizer?.addTarget(self, action: #selector(swiped))
        // Each screen's navigation item says whether its title is large.
        navigation.navigationBar.prefersLargeTitles = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        hostController(navigation)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        hostController(navigation)
    }

    func style(_ style: KuitoViewStyle, in tree: KuitoTreeLinks) {
        sharedElements = tree.sharedElements
        layout = style.layout
    }

    /// UIKit slides screens in from the trailing edge of the controller's
    /// view and takes the back swipe from its leading edge; the bar places
    /// the back button by its own attribute.
    override func layoutSubviews() {
        super.layoutSubviews()

        let attribute: UISemanticContentAttribute = layout?.rightToLeft == true ? .forceRightToLeft : .forceLeftToRight

        guard navigation.view.semanticContentAttribute != attribute else { return }

        navigation.view.semanticContentAttribute = attribute
        navigation.navigationBar.semanticContentAttribute = attribute
    }

    func adopt(_ page: UIView, label _: String, at index: Int?) throws {
        guard let screen = page as? KuitoNavigationScreenView else { throw unsupported(page) }

        screens.insert(KuitoNavigationScreenController(screen: screen), at: min(max(index ?? screens.count, 0), screens.count))
        scheduleSync()
    }

    func move(_ page: UIView, to index: Int) throws {
        let controller = screens.remove(at: try position(of: page))

        screens.insert(controller, at: min(max(index, 0), screens.count))
        scheduleSync()
    }

    func release(_ page: UIView, gone: @escaping () -> Void) throws {
        let controller = screens.remove(at: try position(of: page))

        // The platform already took it off the stack.
        guard !controller.popped else { return gone() }

        removals.append(gone)
        scheduleSync()
    }

    // MARK: - UINavigationControllerDelegate

    /// Every animated push and pop, the edge swipe included, flies the views
    /// both screens share alongside UIKit's own transition.
    func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController, animated: Bool) {
        guard animated, let coordinator = navigationController.transitionCoordinator else { return }

        motion.wake()

        KuitoSharedTransition.run(alongside: coordinator, sharedElements: sharedElements)
    }

    func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
        collectUserPops()
    }

    @objc private func swiped() {
        motion.wake()
    }

    /// How far the screen a pop takes away has gone, as UIKit draws it; nil while no pop runs.
    private func popProgress() -> CGFloat? {
        guard let coordinator = navigation.transitionCoordinator,
              let outgoing = coordinator.viewController(forKey: .from),
              !navigation.viewControllers.contains(outgoing),
              navigation.view.bounds.width > 0 else { return nil }

        let frame = (outgoing.view.layer.presentation() ?? outgoing.view.layer).frame

        return min(abs(frame.minX) / navigation.view.bounds.width, 1)
    }

    // MARK: - Sync

    private func scheduleSync() {
        guard !syncScheduled else { return }

        syncScheduled = true
        DispatchQueue.main.async { self.sync() }
    }

    /// Gives UIKit the kernel's stack: a screen added on top pushes (animated
    /// unless it is the first), the top one removed pops, anything else sets
    /// the stack without animation.
    private func sync() {
        // Changing the stack mid-transition (an edge swipe in progress) breaks
        // UIKit's transition; apply once it has finished or been cancelled.
        if let transition = navigation.transitionCoordinator {
            _ = transition.animate(alongsideTransition: nil) { _ in MainActor.assumeIsolated { self.sync() } }

            return
        }

        syncScheduled = false
        collectUserPops()

        let wanted: [UIViewController] = screens.filter { !$0.popped }
        let current = navigation.viewControllers
        let finished = removals

        removals.removeAll()
        applied = wanted

        if wanted.elementsEqual(current, by: ===) {
            // Nothing to show or hide.
        } else if !current.isEmpty, let top = wanted.last, wanted.dropLast().elementsEqual(current, by: ===) {
            navigation.pushViewController(top, animated: true)
        } else if !wanted.isEmpty, current.dropLast().elementsEqual(wanted, by: ===) {
            navigation.popViewController(animated: true)
        } else {
            navigation.setViewControllers(wanted, animated: false)
        }

        guard let transition = navigation.transitionCoordinator else { return finished.forEach { $0() } }

        _ = transition.animate(alongsideTransition: nil) { _ in MainActor.assumeIsolated { finished.forEach { $0() } } }
    }

    /// Screens UIKit dropped without the kernel asking: the edge swipe, the
    /// back button or its menu. Each reports `dismiss` once.
    private func collectUserPops() {
        let shown = navigation.viewControllers

        for screen in screens where !screen.popped && applied.contains(where: { $0 === screen }) && !shown.contains(where: { $0 === screen }) {
            screen.popped = true
            screen.screen.emit?("dismiss", nil)
        }

        applied.removeAll { controller in !shown.contains { $0 === controller } }
    }

    private func position(of page: UIView) throws -> Int {
        guard let index = screens.firstIndex(where: { $0.screen === page }) else { throw unsupported(page) }

        return index
    }

    /// A screen the platform hasn't popped yet leaves with UIKit's pop.
    func animatesRemoval(_ page: UIView) -> Bool {
        screens.contains { $0.screen === page && !$0.popped }
    }

    private func unsupported(_ page: UIView) -> KuitoRenderError {
        .invalidTree("\(type(of: page)) is not a NavigationStack screen")
    }
}

/// Keeps the edge swipe working when a screen hides the navigation bar:
/// UIKit's own gate refuses the swipe without a visible bar.
@MainActor
final class KuitoNavigationController: UINavigationController, UIGestureRecognizerDelegate {
    override func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1 && transitionCoordinator == nil
    }
}
