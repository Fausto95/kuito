import CoreLocation

/// One request's own `CLLocationManager`: a single fix, or a watch's stream
/// of them. Each has its own manager so each keeps its own accuracy and
/// distance filter; Core Location merges them into one radio schedule.
@MainActor
final class KuitoLocationUpdates: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let once: Bool
    private let onFix: (CLLocation) -> Void
    private let onError: (KuitoModuleError) -> Void

    init(
        accuracy: LocationAccuracy,
        distance: Double = 0,
        once: Bool,
        onFix: @escaping (CLLocation) -> Void,
        onError: @escaping (KuitoModuleError) -> Void
    ) {
        self.once = once
        self.onFix = onFix
        self.onError = onError
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = accuracy.desired
        manager.distanceFilter = distance > 0 ? distance : kCLDistanceFilterNone
        if once { manager.requestLocation() } else { manager.startUpdatingLocation() }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.delegate = nil
    }

    // The delegate is called on the thread the manager was made on: main.
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated {
            guard let location = locations.last else { return }

            if once { stop() }
            onFix(location)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            let code = (error as? CLError)?.code

            // A watch rides out a fix it couldn't get; Core Location keeps trying.
            if code == .locationUnknown && !once { return }

            stop()
            onError(code == .denied
                ? KuitoLocationModule.denied
                : KuitoModuleError("ERR_LOCATION_UNAVAILABLE", error.localizedDescription))
        }
    }
}
