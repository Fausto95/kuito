import BackgroundTasks
import UIKit

/// Between BGTaskScheduler and the runtimes that run tasks
/// (docs/background-tasks.md). The shell registers the launch handlers while
/// the app launches; each launch becomes a run, delivered to the latest
/// runtime listening for runs, or held until one starts. A run ends when
/// JavaScript finishes it, the OS expires it, or its deadline passes, and
/// only then is the OS told. It outlives runtimes, so a reload or a headless
/// runtime stopping never loses a run the OS is waiting on.
@MainActor
final class KuitoBackgroundTasks {
    struct Options: Codable {
        /// Minutes; src/native/background-tasks.ts enforces at least 15.
        let minimumInterval: Double
        let requiresNetwork: Bool
        let requiresCharging: Bool
    }

    static let shared = KuitoBackgroundTasks()

    /// iOS gives an app refresh task about 30 seconds and a processing task
    /// minutes, then expires it. Runs end a little before, so the app is
    /// never the one the OS has to cut off.
    private static let budget: (refresh: TimeInterval, processing: TimeInterval) = (25, 170)
    private static let registrations = "dev.kuito.backgroundTasks"
    /// The Darwin notification, plus the task's name, that runs it on the Simulator.
    private static let simulatedLaunch = "dev.kuito.backgroundTasks.run."

    /// The identifiers kuito.config.ts declared, which the Info.plist permits.
    let declared = Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String] ?? []

    private struct Running {
        let name: String
        /// Tells the OS how the run went.
        let complete: (Bool) -> Void
        let timeout: DispatchWorkItem
        /// A run per delivery (a location task's fixes) logs only when it fails.
        let quiet: Bool
    }

    private var running: [String: Running] = [:]
    /// Runs no runtime took yet.
    private var waiting: [BackgroundTaskDelivery] = []
    private var observers: [(token: UUID, deliver: (BackgroundTaskDelivery) -> Void)] = []
    private var startRuntime: () -> Void = {}
    /// Sources whose runs come every few seconds (location tasks): a runtime
    /// started for runs stays up between them while one is held.
    private var holds: Set<String> = []

    /// Called when the last run ended and nothing is held, so a runtime started for runs can stop.
    var onIdle: (() -> Void)?

    /// BGTaskScheduler takes handlers only before launch ends. `startRuntime`
    /// starts a runtime when a run arrives and none is listening.
    func registerLaunchHandlers(startRuntime: @escaping () -> Void) {
        self.startRuntime = startRuntime

        for name in declared {
            BGTaskScheduler.shared.register(forTaskWithIdentifier: name, using: .main) { task in
                MainActor.assumeIsolated { KuitoBackgroundTasks.shared.launched(task) }
            }
        }

        #if targetEnvironment(simulator)
        listenForSimulatedLaunches()
        #endif
    }

    #if targetEnvironment(simulator)
    /// The Simulator has no BGTaskScheduler: `submit` fails and the debugger's
    /// simulated launch finds no request. A Darwin notification per task
    /// starts a run instead, as an app refresh launch would.
    private func listenForSimulatedLaunches() {
        for name in declared {
            CFNotificationCenterAddObserver(
                CFNotificationCenterGetDarwinNotifyCenter(), nil,
                { _, _, notification, _, _ in
                    guard let posted = notification?.rawValue as String? else { return }

                    let name = String(posted.dropFirst(KuitoBackgroundTasks.simulatedLaunch.count))

                    DispatchQueue.main.async {
                        MainActor.assumeIsolated {
                            _ = KuitoBackgroundTasks.shared.start(name, budget: KuitoBackgroundTasks.budget.refresh) { _ in }
                        }
                    }
                },
                (Self.simulatedLaunch + name) as CFString, nil, .deliverImmediately)
        }
    }
    #endif

    // MARK: Registration

    func register(_ name: String, _ options: Options) throws {
        guard declared.contains(name) else {
            throw KuitoModuleError("ERR_UNDECLARED", "Background task '\(name)' is not declared. Add it to backgroundTasks in kuito.config.ts and rebuild the app.")
        }

        var stored = registered
        stored[name] = options
        registered = stored
        try submit(name, options)
        #if !targetEnvironment(simulator)
        NSLog("[Kuito] Background task '%@' registered. To run it now, pause in the debugger and run: e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@\"%@\"]", name, name)
        #endif
    }

    func unregister(_ name: String) {
        var stored = registered
        stored[name] = nil
        registered = stored
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: name)
    }

    var status: BackgroundTaskStatus {
        switch UIApplication.shared.backgroundRefreshStatus {
        case .available: .available
        case .denied: .denied
        case .restricted: .restricted
        @unknown default: .restricted
        }
    }

    /// Registered tasks and their options, kept across launches: iOS runs a
    /// request once, so each run asks for the next.
    private var registered: [String: Options] {
        get {
            UserDefaults.standard.data(forKey: Self.registrations)
                .flatMap { try? JSONDecoder().decode([String: Options].self, from: $0) } ?? [:]
        }
        set {
            UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: Self.registrations)
        }
    }

    /// Power is something only a processing task can wait for; an app refresh task runs more often.
    private func submit(_ name: String, _ options: Options) throws {
        let request: BGTaskRequest

        if options.requiresCharging {
            let processing = BGProcessingTaskRequest(identifier: name)

            processing.requiresExternalPower = true
            processing.requiresNetworkConnectivity = options.requiresNetwork
            request = processing
        } else {
            request = BGAppRefreshTaskRequest(identifier: name)
        }

        request.earliestBeginDate = Date(timeIntervalSinceNow: options.minimumInterval * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch let error as BGTaskScheduler.Error where error.code == .unavailable {
            #if targetEnvironment(simulator)
            NSLog("[Kuito] The Simulator has no BGTaskScheduler. To run '%@' now: xcrun simctl spawn booted notifyutil -p %@%@", name, Self.simulatedLaunch, name)
            #else
            throw KuitoModuleError("ERR_UNAVAILABLE", "Background tasks are unavailable: Background App Refresh is off for this app.")
            #endif
        } catch {
            throw KuitoModuleError("ERR_SCHEDULE", "iOS did not schedule '\(name)': \(error.localizedDescription)")
        }
    }

    // MARK: Runs

    private func launched(_ task: BGTask) {
        let name = task.identifier

        if let options = registered[name] {
            do { try submit(name, options) } catch { NSLog("[Kuito] Background task '%@' was not rescheduled: %@", name, "\(error)") }
        }

        let id = start(name, budget: task is BGProcessingTask ? Self.budget.processing : Self.budget.refresh) {
            task.setTaskCompleted(success: $0)
        }

        task.expirationHandler = { [weak self] in
            DispatchQueue.main.async { self?.finish(id, succeeded: false, because: "was expired by iOS") }
        }
    }

    /// A run of `name` with `data`, for a source of the app's own, which may
    /// come while the app is in the background: a background task assertion
    /// keeps iOS from suspending the app before the run ends.
    func deliver(_ name: String, data: some Encodable, budget: TimeInterval) {
        let json: Any

        do {
            json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(data), options: .fragmentsAllowed)
        } catch {
            return NSLog("[Kuito] Background task '%@' got data that is not JSON: %@", name, "\(error)")
        }

        var assertion = UIBackgroundTaskIdentifier.invalid
        let id = start(name, budget: budget, data: json) { _ in UIApplication.shared.endBackgroundTask(assertion) }

        assertion = UIApplication.shared.beginBackgroundTask(withName: "Kuito task \(name)") {
            KuitoBackgroundTasks.shared.finish(id, succeeded: false, because: "was expired by iOS")
        }

        // A runtime that failed to start ended the run already.
        if running[id] == nil { UIApplication.shared.endBackgroundTask(assertion) }
    }

    func hold(_ source: String) {
        holds.insert(source)
    }

    func release(_ source: String) {
        guard holds.remove(source) != nil else { return }

        if running.isEmpty && holds.isEmpty { onIdle?() }
    }

    /// A run of `name` that ends within `budget` seconds, delivered or held for a runtime.
    private func start(_ name: String, budget: TimeInterval, data: Any? = nil,
                       complete: @escaping (Bool) -> Void) -> String {
        // The deadline is in milliseconds since the epoch, as JavaScript's Date.now().
        let run = BackgroundTaskDelivery(id: UUID().uuidString, name: name,
                                         deadline: (Date().timeIntervalSince1970 + budget) * 1000, data: data)
        let timeout = DispatchWorkItem { [weak self] in
            self?.finish(run.id, succeeded: false, because: "ran past its deadline")
        }

        running[run.id] = Running(name: name, complete: complete, timeout: timeout, quiet: data != nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + budget, execute: timeout)

        // The latest: the app's UI, opened while a headless runtime still runs location tasks.
        if let observer = observers.last {
            observer.deliver(run)
        } else {
            waiting.append(run)
            startRuntime()
        }

        return run.id
    }

    /// Ends a run and tells the OS. A run already ended is ignored.
    func finish(_ id: String, succeeded: Bool, because reason: String? = nil) {
        guard let run = running.removeValue(forKey: id) else { return }

        run.timeout.cancel()
        waiting.removeAll { $0.id == id }
        run.complete(succeeded)

        if !(succeeded && run.quiet) {
            NSLog("[Kuito] Background task '%@' %@", run.name, reason ?? (succeeded ? "succeeded" : "failed"))
        }

        if running.isEmpty && holds.isEmpty { onIdle?() }
    }

    /// Ends every run no runtime took: the runtime started for them failed.
    func abandonWaiting(because reason: String) {
        waiting.map(\.id).forEach { finish($0, succeeded: false, because: reason) }
    }

    /// Delivers runs to `deliver` until the token is cancelled, starting with those waiting.
    func observe(_ deliver: @escaping (BackgroundTaskDelivery) -> Void) -> UUID {
        let token = UUID()

        observers.append((token, deliver))
        waiting.forEach(deliver)
        waiting.removeAll()

        return token
    }

    func cancel(_ token: UUID) {
        observers.removeAll { $0.token == token }
    }
}
