import CoreTelephony
import Network

/// `Network` in native/modules/network/network.ts.
final class KuitoNetworkModule: NetworkSpec {
    private let queue = DispatchQueue(label: "dev.kuito.network")
    private let telephony = CTTelephonyNetworkInfo()
    // Touched only on `queue`.
    private var monitor: NWPathMonitor?
    private var path: NWPath?
    private var last: KuitoNetworkState?

    init(context: KuitoModuleContext) {}

    func state() -> NetworkState {
        read().linked
    }

    func refresh() -> NetworkState {
        read().linked
    }

    @MainActor func startState(_ signal: KuitoSignal<NetworkState>) {
        start(signal)
    }

    @MainActor func stopState() {
        queue.sync {
            monitor?.cancel()
            monitor = nil
            path = nil
            last = nil
        }
    }

    // The first update is the path as monitoring starts, which JavaScript
    // drops unless it changed since its last read; later ones are sent only
    // on change. The handler runs on `queue`, not the main actor.
    private func start(_ signal: KuitoSignal<NetworkState>) {
        let monitor = NWPathMonitor()

        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }

            let state = KuitoNetworkState(path, telephony: self.telephony)

            self.path = path
            guard state != self.last else { return }

            self.last = state
            signal.set(state.linked)
        }
        queue.sync { self.monitor = monitor }
        monitor.start(queue: queue)
    }

    /// The running monitor's latest path, or a one-shot monitor's first one.
    private func read() -> KuitoNetworkState {
        if let path = queue.sync(execute: { self.path }) {
            return KuitoNetworkState(path, telephony: telephony)
        }

        return probe()
    }

    // NWPathMonitor has no synchronous read: a fresh monitor delivers the
    // current path on its first update, which arrives within milliseconds.
    private func probe() -> KuitoNetworkState {
        let probe = NWPathMonitor()
        let delivered = DispatchSemaphore(value: 0)
        var path: NWPath?

        probe.pathUpdateHandler = { update in
            path = update
            delivered.signal()
        }
        probe.start(queue: DispatchQueue(label: "dev.kuito.network.probe"))

        // Bounded so a stuck path service cannot hang the JS thread.
        let state = delivered.wait(timeout: .now() + 1) == .success
            ? path.map { KuitoNetworkState($0, telephony: telephony) }
            : nil

        probe.cancel()

        return state ?? .unknown
    }
}
