import UIKit

/// A kind a native module contributes (docs/native-modules.md#views): how to make its
/// view, and the props it owns ahead of the shared tables.
struct KuitoModuleViewKind {
    let make: KuitoViewFactory.Make
    let props: [String: KuitoPropertySetter]
}

/// Kinds native modules contribute, by kind (`module:<Name>`). The link
/// table adds a module's view on the JS thread the first time the kernel
/// plans one, before the view's first mutation reaches the main thread. A reloaded runtime registers its modules again.
///
/// It also holds the module views the renderer shows, by number, for the view
/// methods JavaScript calls through a ref (docs/native-modules.md#views).
final class KuitoModuleViews {
    static let shared = KuitoModuleViews()

    private let lock = NSLock()
    private var kinds: [String: KuitoModuleViewKind] = [:]
    @MainActor private var mounted: [UInt32: UIView] = [:]

    @MainActor func mount(_ id: UInt32, _ view: UIView) {
        mounted[id] = view
    }

    @MainActor func unmount(_ id: UInt32) {
        (mounted.removeValue(forKey: id) as? KuitoNativeView)?.unmount()
    }

    @MainActor func unmountAll() {
        let views = mounted.values

        mounted.removeAll()
        views.forEach { ($0 as? KuitoNativeView)?.unmount() }
    }

    @MainActor func view(_ id: UInt32) -> UIView? {
        mounted[id]
    }

    func register(_ kind: String, _ view: KuitoModuleViewKind) {
        lock.lock()
        defer { lock.unlock() }

        kinds[kind] = view
    }

    func kind(_ kind: String) -> KuitoModuleViewKind? {
        lock.lock()
        defer { lock.unlock() }

        return kinds[kind]
    }
}
