import UIKit

/// The renderer tests' host: a scene on screen, so UIKit runs presentations
/// to completion. Without a host app, a presented sheet never gets a window
/// and its transition never ends.
@main
final class KuitoTestHost: UIResponder, UIApplicationDelegate, UIWindowSceneDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        configurationForConnecting session: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)

        configuration.delegateClass = KuitoTestHost.self

        return configuration
    }
}
