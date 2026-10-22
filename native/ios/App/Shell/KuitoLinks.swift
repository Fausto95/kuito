import UIKit
import UserNotifications

/// The links that open the app, and the way out to other apps. The shell
/// reports links from its scene delegate; the Linking module reads the first
/// and forwards the rest. Main thread only, except `latest`. It outlives runtimes, so a reload still
/// sees the last link.
final class KuitoLinks: @unchecked Sendable {
    static let shared = KuitoLinks()

    private let lock = NSLock()
    private var last: URL?
    private var observers: [UUID: (URL) -> Void] = [:]

    /// The link that last opened the app, starting with the launch link: read from the JS thread.
    var latest: URL? { lock.withLock { last } }

    /// The link a tap on a notification opens, which Notifications reads at
    /// launch; a shell without it opens none.
    var notificationLink: (UNNotificationResponse) -> URL? = { _ in nil }

    /// The scene connected: with the link that launched the app, if any.
    func launched(with url: URL?) {
        lock.withLock { last = url }
    }

    /// A link arrived while the app runs.
    func received(_ url: URL) {
        lock.withLock { last = url }
        observers.values.forEach { $0(url) }
    }

    /// Calls `observer` with each link received until the returned token is cancelled.
    func observe(_ observer: @escaping (URL) -> Void) -> UUID {
        let token = UUID()

        observers[token] = observer

        return token
    }

    func cancel(_ token: UUID) {
        observers[token] = nil
    }

    /// Opens `url` in the app that handles it: `linking.open`, and a
    /// WebView's links outside its whitelist.
    func open(_ url: URL, completion: @escaping (Bool) -> Void = { _ in }) {
        UIApplication.shared.open(url, completionHandler: completion)
    }
}
