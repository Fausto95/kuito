import UIKit

/// Whether the app is in the foreground, and memory warnings. The shell
/// reports them from its scene and app delegates; `AppState` and `Brightness`
/// observe them here. Observers are main-thread only; `state` is read from any
/// thread, since `AppState.currentState` answers on the JS thread. It outlives
/// runtimes, so a reload starts with the current state.
final class KuitoAppLifecycle {
    enum State: String, Encodable {
        case active, background, inactive
    }

    enum Event {
        case changed(State)
        case memoryWarning
    }

    static let shared = KuitoAppLifecycle()

    private let lock = NSLock()
    private var current = State.inactive
    private var observers: [UUID: (Event) -> Void] = [:]

    var state: State { lock.withLock { current } }

    /// The scene connected, or moved between foreground, inactive and background.
    func changed(to activation: UIScene.ActivationState) {
        let state = Self.states[activation] ?? .inactive
        let previous = lock.withLock { () -> State in
            defer { current = state }
            return current
        }

        if previous != state { notify(.changed(state)) }
    }

    func receivedMemoryWarning() {
        notify(.memoryWarning)
    }

    /// Calls `observer` with each change until the returned token is cancelled.
    func observe(_ observer: @escaping (Event) -> Void) -> UUID {
        let token = UUID()

        observers[token] = observer

        return token
    }

    func cancel(_ token: UUID) {
        observers[token] = nil
    }

    private func notify(_ event: Event) {
        observers.values.forEach { $0(event) }
    }

    /// A scene connecting is still `unattached`; it becomes active or moves to the background next.
    private static let states: [UIScene.ActivationState: State] = [
        .unattached: .inactive,
        .foregroundActive: .active,
        .foregroundInactive: .inactive,
        .background: .background,
    ]
}
