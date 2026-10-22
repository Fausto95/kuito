import UIKit

/// Why the app launched, for the modules' launches (docs/native-modules.md#launch).
@MainActor
enum KuitoLaunchOptions {
    static var current: [UIApplication.LaunchOptionsKey: Any] = [:]
}
