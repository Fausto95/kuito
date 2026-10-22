import UIKit

/// Settings from kuito.config.ts that UIKit doesn't apply on its own: the CLI
/// writes them into Info.plist (src/cli/app-settings.ts) and the shell reads them here.
enum KuitoAppSettings {
    private static let info = Bundle.main.infoDictionary ?? [:]

    private static let statusBarStyles: [String: UIStatusBarStyle] = [
        "UIStatusBarStyleDefault": .default,
        "UIStatusBarStyleLightContent": .lightContent,
        "UIStatusBarStyleDarkContent": .darkContent,
    ]

    /// The root window's color, behind the app.
    static let backgroundColor: UIColor? = (info["KuitoBackgroundColor"] as? String).flatMap(color)

    /// The status bar as it launched; view-controller-based appearance keeps it after launch.
    static let statusBarStyle = (info["UIStatusBarStyle"] as? String).flatMap { statusBarStyles[$0] } ?? .default
    static let statusBarHidden = info["UIStatusBarHidden"] as? Bool ?? false

    /// `#RRGGBB`, as kuito.config.ts validates it.
    private static func color(_ hex: String) -> UIColor? {
        guard hex.count == 7, hex.hasPrefix("#"), let rgb = UInt32(hex.dropFirst(), radix: 16) else { return nil }

        return UIColor(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255,
                       blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}
