import CoreLocation
import UIKit

/// Location "when in use" (`location`) or "always" (`locationAlways`).
/// Reduced accuracy counts as granted, as in Expo; the Location module
/// reports the accuracy itself.
@MainActor
final class KuitoLocationPermission: NSObject, KuitoPermissionSource, CLLocationManagerDelegate {
    /// iOS offers the step from "when in use" to "always" once; this remembers it was offered.
    private static let upgradeOffered = "dev.kuito.permissions.locationAlways"

    private let always: Bool
    private let manager = CLLocationManager()
    private var waiting: [(KuitoPermissionResponse) -> Void] = []
    private var activation: NSObjectProtocol?
    /// The status a pending request started from: an authorization change means the user answered.
    private var askedFrom: CLAuthorizationStatus?

    init(always: Bool) {
        self.always = always
        super.init()
        manager.delegate = self
    }

    func check(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        done(response())
    }

    func request(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        guard response().status == .undetermined else { return done(response()) }

        waiting.append(done)
        askedFrom = manager.authorizationStatus

        guard always else { return manager.requestWhenInUseAuthorization() }

        // Keeping "when in use" when offered "always" changes nothing, so no
        // authorization change follows: the app becoming active again as the
        // prompt closes is the answer.
        activation = activation ?? NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in MainActor.assumeIsolated { self?.settle() } }
        UserDefaults.standard.set(true, forKey: Self.upgradeOffered)
        manager.requestAlwaysAuthorization()
    }

    // The delegate is called on the thread the manager was made on: main. It
    // also fires when the manager is made, with the status the request started from.
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            if manager.authorizationStatus != askedFrom { settle() }
        }
    }

    /// Answers the waiting requests once the user has: never while undetermined.
    private func settle() {
        guard !waiting.isEmpty, manager.authorizationStatus != .notDetermined else { return }

        let answer = response()
        let settled = waiting

        waiting = []
        askedFrom = nil
        activation.map(NotificationCenter.default.removeObserver)
        activation = nil
        settled.forEach { $0(answer) }
    }

    private func response() -> KuitoPermissionResponse {
        switch manager.authorizationStatus {
        case .authorizedAlways: return KuitoPermissionResponse(.granted)
        case .authorizedWhenInUse where !always: return KuitoPermissionResponse(.granted)
        case .authorizedWhenInUse:
            return UserDefaults.standard.bool(forKey: Self.upgradeOffered)
                ? KuitoPermissionResponse(.denied)
                : KuitoPermissionResponse(.undetermined)
        case .notDetermined: return KuitoPermissionResponse(.undetermined)
        case .denied, .restricted: return KuitoPermissionResponse(.denied)
        @unknown default: return KuitoPermissionResponse(.denied)
        }
    }
}
