import UIKit

/// NavigationTabs: a UITabBarController whose tabs follow the view's
/// NavigationTab children, in order (docs/navigation.md). The selection is
/// the kernel's: a tap reports `select` and changes nothing until the kernel
/// sets `selectedIndex`, so the bar always shows the kernel's state.
@MainActor
final class KuitoNavigationTabsView: UIView, KuitoHost, UITabBarControllerDelegate {
    var emit: ((String, (any KuitoEventPayload)?) -> Void)?

    /// Applies once that many tabs exist: the prop arrives before the tabs.
    var selectedIndex = 0 {
        didSet { applySelection() }
    }

    private let tabBar = UITabBarController()
    private var tabs: [KuitoNavigationTabController] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        tabBar.delegate = self
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        hostController(tabBar)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        hostController(tabBar)
    }

    func adopt(_ page: UIView, label _: String, at index: Int?) throws {
        guard let tab = page as? KuitoNavigationTabView else { throw unsupported(page) }

        tabs.insert(KuitoNavigationTabController(tab: tab), at: min(max(index ?? tabs.count, 0), tabs.count))
        sync()
    }

    func move(_ page: UIView, to index: Int) throws {
        let controller = tabs.remove(at: try position(of: page))

        tabs.insert(controller, at: min(max(index, 0), tabs.count))
        sync()
    }

    func release(_ page: UIView, gone: @escaping () -> Void) throws {
        tabs.remove(at: try position(of: page))
        sync()
        gone()
    }

    /// A tab leaves at once: no transition plays.
    func animatesRemoval(_: UIView) -> Bool {
        false
    }

    // MARK: - UITabBarControllerDelegate

    func tabBarController(_ tabBarController: UITabBarController, shouldSelect viewController: UIViewController) -> Bool {
        if let index = tabs.firstIndex(where: { $0 === viewController }) { emit?("select", KuitoIndexPayload(index: Double(index))) }

        return false
    }

    // MARK: - Sync

    private func sync() {
        tabBar.setViewControllers(tabs, animated: false)
        applySelection()
    }

    private func applySelection() {
        guard tabs.indices.contains(selectedIndex), tabBar.selectedIndex != selectedIndex else { return }

        tabBar.selectedIndex = selectedIndex
    }

    private func position(of page: UIView) throws -> Int {
        guard let index = tabs.firstIndex(where: { $0.page === page }) else { throw unsupported(page) }

        return index
    }

    private func unsupported(_ page: UIView) -> KuitoRenderError {
        .invalidTree("\(type(of: page)) is not a NavigationTabs tab")
    }
}
