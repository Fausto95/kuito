import CoreLocation

/// The location tasks' updates (docs/location.md#background-updates). Each
/// started task keeps its own manager, which locates in the background, and
/// each delivery of fixes becomes a run of the task through
/// `KuitoBackgroundTasks`. Tasks outlive runtimes and, stored in
/// UserDefaults, launches: defining a task resumes its updates.
@MainActor
final class KuitoLocationTasks {
    /// `startLocationUpdates`' request, minus Android's options, as UserDefaults keeps it.
    struct Options: Codable {
        let name: String
        let accuracy: LocationAccuracy
        let distanceInterval: Double
        let pausesUpdatesAutomatically: Bool
        let showsBackgroundLocationIndicator: Bool

        init(_ request: LocationUpdatesRequest) {
            name = request.name
            accuracy = request.accuracy
            distanceInterval = request.distanceInterval
            pausesUpdatesAutomatically = request.pausesUpdatesAutomatically
            showsBackgroundLocationIndicator = request.showsBackgroundLocationIndicator
        }
    }

    static let shared = KuitoLocationTasks()

    private static let stored = "dev.kuito.location.tasks"
    /// A backgrounded app gets about 30 seconds per assertion; runs end before.
    private static let budget: TimeInterval = 25

    private var running: [String: KuitoLocationTaskUpdates] = [:]

    /// Started tasks and their options, kept across launches.
    private var started: [String: Options] {
        get {
            UserDefaults.standard.data(forKey: Self.stored)
                .flatMap { try? JSONDecoder().decode([String: Options].self, from: $0) } ?? [:]
        }
        set {
            UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: Self.stored)
        }
    }

    /// Core Location traps an app that locates in the background without the mode.
    private var declared: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []).contains("location")
    }

    func start(_ options: Options) throws {
        guard declared else {
            throw KuitoModuleError("ERR_UNDECLARED", "Background location is not declared. Add permissions.locationAlways to kuito.config.ts and rebuild the app.")
        }

        var tasks = started
        tasks[options.name] = options
        started = tasks
        run(options)
    }

    func stop(_ name: String) {
        var tasks = started
        tasks[name] = nil
        started = tasks
        running.removeValue(forKey: name)?.stop()
        KuitoBackgroundTasks.shared.release(Self.source(name))
    }

    func hasStarted(_ name: String) -> Bool {
        started[name] != nil
    }

    /// Restarts a stored task this launch isn't running yet; access revoked since forgets it.
    func resume(_ name: String) {
        guard running[name] == nil, let options = started[name], declared else { return }

        KuitoPermissions.check(.location) { [weak self] response in
            guard response.status == .granted else {
                NSLog("[Kuito] Location task '%@' stopped: location access is no longer granted", name)
                return self?.stop(name) ?? ()
            }

            self?.run(options)
        }
    }

    private func run(_ options: Options) {
        let name = options.name

        running[name]?.stop()
        running[name] = KuitoLocationTaskUpdates(
            options,
            onFixes: { fixes in
                let data = KuitoLocationRunData(["locations": fixes.map { LocationObject($0).kuitoEncoded() }])

                KuitoBackgroundTasks.shared.deliver(name, data: data, budget: Self.budget)
            },
            onDenied: { [weak self] in
                NSLog("[Kuito] Location task '%@' stopped: location access was revoked", name)
                self?.stop(name)
            }
        )
        KuitoBackgroundTasks.shared.hold(Self.source(name))
    }

    private static func source(_ name: String) -> String { "location:\(name)" }
}

/// A run's data, `LocationTaskRun.locations` in src/native/location.ts: the
/// spec's records as Foundation JSON, which `KuitoBackgroundTasks.deliver`
/// takes as Encodable.
private struct KuitoLocationRunData: Encodable {
    let json: Any

    init(_ json: Any) {
        self.json = json
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch json {
        case let fields as [String: Any]: try container.encode(fields.mapValues(KuitoLocationRunData.init))
        case let items as [Any]: try container.encode(items.map(KuitoLocationRunData.init))
        case let text as String: try container.encode(text)
        case let number as NSNumber where KuitoArgument.isBoolean(number): try container.encode(number.boolValue)
        case let number as NSNumber: try container.encode(number.doubleValue)
        default: try container.encodeNil()
        }
    }
}

/// One location task's manager. With "always" access it also monitors
/// significant changes, so iOS relaunches the app after it was terminated.
@MainActor
final class KuitoLocationTaskUpdates: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let onFixes: ([CLLocation]) -> Void
    private let onDenied: () -> Void

    init(_ options: KuitoLocationTasks.Options,
         onFixes: @escaping ([CLLocation]) -> Void,
         onDenied: @escaping () -> Void) {
        self.onFixes = onFixes
        self.onDenied = onDenied
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = options.accuracy.desired
        manager.distanceFilter = options.distanceInterval > 0 ? options.distanceInterval : kCLDistanceFilterNone
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = options.pausesUpdatesAutomatically
        manager.showsBackgroundLocationIndicator = options.showsBackgroundLocationIndicator
        manager.startUpdatingLocation()

        if manager.authorizationStatus == .authorizedAlways { manager.startMonitoringSignificantLocationChanges() }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.delegate = nil
    }

    // The delegate is called on the thread the manager was made on: main.
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated { onFixes(locations) }
    }

    // A fix it couldn't get yet is no error: Core Location keeps trying.
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            if (error as? CLError)?.code == .denied { onDenied() }
        }
    }
}
