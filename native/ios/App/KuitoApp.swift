import UIKit

/// Native UIKit shell: Hermes on the device, Live Patched by the dev server.
@main
final class KuitoAppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Before launch ends: a background task or a location event may be why the app
        // launched, with no scene to show, and iOS drops the notification tap that
        // launched it without a delegate.
        KuitoLaunchOptions.current = launchOptions ?? [:]
        KuitoLink.launch()

        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = KuitoSceneDelegate.self
        return configuration
    }

    // Push registration answers here; notifications.register waits for it.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        KuitoPushRegistration.shared.answer(.success(deviceToken))
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        KuitoPushRegistration.shared.answer(.failure(error))
    }

    func applicationDidReceiveMemoryWarning(_ application: UIApplication) {
        KuitoAppLifecycle.shared.receivedMemoryWarning()
    }
}

/// iOS 27 traps apps that skip the UIScene lifecycle; the window belongs to the scene.
final class KuitoSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        // Before the view controller starts the runtime, so its first reads are current.
        KuitoAppLifecycle.shared.changed(to: scene.activationState)
        KuitoTraits.shared.update(windowScene.traitCollection)
        let window = KuitoWindow(windowScene: windowScene)
        window.backgroundColor = KuitoAppSettings.backgroundColor
        window.rootViewController = KuitoViewController()
        window.makeKeyAndVisible()
        self.window = window
        KuitoLinks.shared.launched(with: connectionOptions.urlContexts.first?.url
            ?? connectionOptions.userActivities.lazy.compactMap(\.webpageURL).first
            ?? connectionOptions.notificationResponse.flatMap(KuitoLinks.shared.notificationLink))
    }

    // Links that arrive while the app runs: its URL scheme, and universal links.
    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        contexts.forEach { KuitoLinks.shared.received($0.url) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        userActivity.webpageURL.map(KuitoLinks.shared.received)
    }

    // Foreground, inactive and background, for AppState.
    func sceneDidBecomeActive(_ scene: UIScene) {
        KuitoAppLifecycle.shared.changed(to: .foregroundActive)
        // Traits changed in the background were held back; catch up.
        (scene as? UIWindowScene).map { KuitoTraits.shared.update($0.traitCollection) }
    }

    func sceneWillResignActive(_ scene: UIScene) {
        KuitoAppLifecycle.shared.changed(to: .foregroundInactive)
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        KuitoAppLifecycle.shared.changed(to: .foregroundInactive)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        KuitoAppLifecycle.shared.changed(to: .background)
    }

    // Light or dark and text size, for Appearance. In the background the
    // system flips the style to snapshot both, which the app must not see.
    func windowScene(_ windowScene: UIWindowScene, didUpdate previousCoordinateSpace: UICoordinateSpace,
                     interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
                     traitCollection previousTraitCollection: UITraitCollection) {
        guard windowScene.activationState != .background else { return }

        KuitoTraits.shared.update(windowScene.traitCollection)
    }
}
