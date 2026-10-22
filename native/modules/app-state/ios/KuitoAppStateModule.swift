import UIKit

/// `AppState` in native/modules/app-state/app-state.ts.
final class KuitoAppStateModule: AppStateSpec {
    private var observations: [String: UUID] = [:]

    init(context: KuitoModuleContext) {}

    func state() -> AppState {
        AppState(KuitoAppLifecycle.shared.state)
    }

    // Starting sends the current state: JavaScript read it before this ran
    // on the main thread, and drops it unless it changed in between.
    @MainActor func startState(_ signal: KuitoSignal<AppState>) {
        observe("state") { event in
            if case let .changed(state) = event { signal.set(AppState(state)) }
        }
        signal.set(state())
    }

    @MainActor func stopState() {
        cancel("state")
    }

    @MainActor func startMemoryWarning(_ emitter: KuitoEmitter<Void>) {
        observe("memoryWarning") { event in
            if case .memoryWarning = event { emitter.send() }
        }
    }

    @MainActor func stopMemoryWarning() {
        cancel("memoryWarning")
    }

    @MainActor func openSettings(_ promise: KuitoPromise<Void>) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            return promise.reject(KuitoErrorCode.native, "The system has no Settings URL")
        }

        UIApplication.shared.open(url) { opened in
            if opened { promise.resolve() } else { promise.reject(KuitoErrorCode.native, "Settings did not open") }
        }
    }

    @MainActor private func observe(_ key: String, _ observer: @escaping (KuitoAppLifecycle.Event) -> Void) {
        observations[key] = KuitoAppLifecycle.shared.observe(observer)
    }

    @MainActor private func cancel(_ key: String) {
        observations.removeValue(forKey: key).map(KuitoAppLifecycle.shared.cancel)
    }
}

private extension AppState {
    init(_ state: KuitoAppLifecycle.State) {
        switch state {
        case .active: self = .active
        case .background: self = .background
        case .inactive: self = .inactive
        }
    }
}
