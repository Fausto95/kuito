import UIKit
import UserNotifications

/// The app's notifications, its push registration, and taps. At launch,
/// before iOS delivers the tap that launched the app, it becomes the
/// notification center's delegate and takes the app delegate's push token
/// answers (`KuitoNotificationsModule.launch`). A tap reports the
/// notification's url to KuitoLinks, as a link that opened the app, so a
/// `<Router linking>` follows it. Main thread, except the delegate
/// callbacks, which hop to it.
final class KuitoNotifications: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = KuitoNotifications()

    /// Where a notification's url travels: a top-level key of a push payload, and of a local one's `userInfo`.
    static let urlKey = "url"

    private var center: UNUserNotificationCenter { .current() }
    private var registering: [(Result<String, Error>) -> Void] = []
    private var observers: [UUID: (NotificationDelivery) -> Void] = [:]

    /// The app finishes launching: from now on this object answers for its notifications.
    func launched() {
        center.delegate = self
        KuitoLinks.shared.notificationLink = { Self.link(of: $0) }
        KuitoPushRegistration.shared.answered = { [weak self] result in
            switch result {
            case .success(let token): self?.registered(token)
            case .failure(let error): self?.failedToRegister(error)
            }
        }
    }

    /// Shows a notification at `at` (milliseconds since the epoch), or now
    /// when it is absent or past, in place of any with the same id. Calls
    /// `completion` with its id once iOS holds it.
    func schedule(id: String?, title: String, body: String?, url: String?, at: Double?,
                  completion: @escaping (Result<String, Error>) -> Void) {
        let id = id ?? UUID().uuidString
        let content = UNMutableNotificationContent()

        content.title = title
        content.body = body ?? ""
        content.sound = .default
        content.userInfo = url.map { [Self.urlKey: $0] } ?? [:]

        // An interval, not calendar components, so a time zone change doesn't move it.
        let delay = at.map { $0 / 1000 - Date().timeIntervalSince1970 } ?? 0
        let trigger = delay > 0 ? UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false) : nil
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        let center = center

        center.getNotificationSettings { settings in
            guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else {
                return completion(.failure(KuitoModuleError(
                    "ERR_PERMISSION",
                    "Notifications.schedule: the app may not show notifications; ask with permissions.request('notifications')"
                )))
            }

            center.removeDeliveredNotifications(withIdentifiers: [id])
            center.add(request) { error in completion(error.map { .failure($0) } ?? .success(id)) }
        }
    }

    /// Asks iOS for the device's APNs token; `completion` gets it in hex, or
    /// why iOS refused. Each call asks again, so one iOS never answered
    /// (offline) doesn't hold the next; the answer settles every call waiting.
    func register(completion: @escaping (Result<String, Error>) -> Void) {
        registering.append(completion)
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// The app delegate's `didRegisterForRemoteNotificationsWithDeviceToken`.
    func registered(_ deviceToken: Data) {
        answer(.success(deviceToken.map { String(format: "%02x", $0) }.joined()))
    }

    /// The app delegate's `didFailToRegisterForRemoteNotificationsWithError`: on a
    /// device, usually an app signed without the `aps-environment` entitlement.
    func failedToRegister(_ error: Error) {
        answer(.failure(error))
    }

    private func answer(_ result: Result<String, Error>) {
        let waiting = registering

        registering = []
        waiting.forEach { $0(result) }
    }

    /// Calls `observer` with each notification that arrives in the foreground until the token is cancelled.
    func observe(_ observer: @escaping (NotificationDelivery) -> Void) -> UUID {
        let token = UUID()

        observers[token] = observer

        return token
    }

    func cancel(observing token: UUID) {
        observers[token] = nil
    }

    /// The link a tap on the notification opens, if it has one.
    static func link(of response: UNNotificationResponse?) -> URL? {
        guard let response, response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return nil }

        return (response.notification.request.content.userInfo[urlKey] as? String).flatMap(URL.init(string:))
    }

    func cancel(_ id: String) {
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.removeDeliveredNotifications(withIdentifiers: [id])
    }

    func cancelAll() {
        center.removeAllPendingNotificationRequests()
        center.removeAllDeliveredNotifications()
    }

    // In the foreground a notification shows as it does in the background,
    // and the app hears it arrive.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let delivery = Self.delivery(of: notification)

        DispatchQueue.main.async { self.observers.values.forEach { $0(delivery) } }
        completionHandler([.banner, .list, .sound])
    }

    private static func delivery(of notification: UNNotification) -> NotificationDelivery {
        let content = notification.request.content
        var data: [String: Any] = [:]

        // A value that isn't JSON (a date another SDK put there) is left out rather than failing the event.
        for (key, value) in content.userInfo {
            if let key = key as? String, key != "aps", key != urlKey, JSONSerialization.isValidJSONObject([value]) {
                data[key] = value
            }
        }

        return NotificationDelivery(
            id: notification.request.identifier,
            title: content.title.isEmpty ? nil : content.title,
            body: content.body.isEmpty ? nil : content.body,
            url: content.userInfo[urlKey] as? String,
            data: data.isEmpty ? nil : data,
            remote: notification.request.trigger is UNPushNotificationTrigger
        )
    }

    // A dismissal is a response too; only the tap opens the link. The scene
    // also reads a launching tap from its connection options, so the link is
    // there whichever runs first; the same link twice is one change.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let url = Self.link(of: response) {
            DispatchQueue.main.async { KuitoLinks.shared.received(url) }
        }

        completionHandler()
    }
}
