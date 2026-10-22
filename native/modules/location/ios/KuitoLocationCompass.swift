import CoreLocation

/// The compass, running only while `heading` has a listener.
@MainActor
final class KuitoLocationCompass: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private let onHeading: (CLHeading) -> Void

    init(onHeading: @escaping (CLHeading) -> Void) {
        self.onHeading = onHeading
        super.init()
        manager.delegate = self
        manager.startUpdatingHeading()
    }

    func stop() {
        manager.stopUpdatingHeading()
        manager.delegate = nil
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading heading: CLHeading) {
        MainActor.assumeIsolated { onHeading(heading) }
    }
}
