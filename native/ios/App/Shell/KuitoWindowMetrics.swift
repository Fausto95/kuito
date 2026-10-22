import UIKit

/// The app window's size, safe-area insets and orientation, in points. The
/// shell's window reports them on each layout, the one moment both are
/// current after a rotation or a resize; `Window` reads them on the JS
/// thread, so `current` takes a lock. Observers are main-thread only.
final class KuitoWindowMetrics: @unchecked Sendable {
    struct Insets: Equatable {
        let top: Double
        let left: Double
        let bottom: Double
        let right: Double
    }

    struct Metrics: Equatable {
        let width: Double
        let height: Double
        let insets: Insets
        let orientation: String
    }

    static let shared = KuitoWindowMetrics()

    private let lock = NSLock()
    private var metrics = Metrics(
        width: 0, height: 0, insets: Insets(top: 0, left: 0, bottom: 0, right: 0), orientation: "portrait")
    private var observers: [UUID: (Metrics) -> Void] = [:]

    var current: Metrics { lock.withLock { metrics } }

    @MainActor
    func update(_ window: UIWindow) {
        let size = window.bounds.size
        let insets = window.safeAreaInsets
        let next = Metrics(
            width: Double(size.width),
            height: Double(size.height),
            insets: Insets(
                top: Double(insets.top), left: Double(insets.left),
                bottom: Double(insets.bottom), right: Double(insets.right)),
            orientation: size.width > size.height ? "landscape" : "portrait")
        let previous = lock.withLock { () -> Metrics in
            defer { metrics = next }
            return metrics
        }

        if previous != next { observers.values.forEach { $0(next) } }
    }

    /// Calls `observer` with each change until the returned token is cancelled.
    func observe(_ observer: @escaping (Metrics) -> Void) -> UUID {
        let token = UUID()

        observers[token] = observer

        return token
    }

    func cancel(_ token: UUID) {
        observers[token] = nil
    }
}
