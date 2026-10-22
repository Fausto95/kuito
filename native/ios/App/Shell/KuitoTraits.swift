import UIKit

/// The user's display preferences: light or dark, and text size. The shell
/// reports its scene's traits here, since UIKit posts no notification for a
/// change of `userInterfaceStyle`; `Appearance` reads and observes them.
/// Observers are main-thread only; `current` is read from any thread, since
/// `Appearance` answers synchronously on the JS thread.
final class KuitoTraits {
    struct Preferences: Encodable, Equatable {
        @KuitoNullable var colorScheme: String?
        let fontScale: Double
    }

    static let shared = KuitoTraits()

    private let lock = NSLock()
    private var preferences = Preferences(colorScheme: nil, fontScale: 1)
    private var observers: [UUID: (Preferences) -> Void] = [:]

    var current: Preferences { lock.withLock { preferences } }

    /// The scene's traits, at connection and on each change. While the app is
    /// in the background the system flips its style to snapshot both
    /// appearances, so the shell reports only from the foreground.
    func update(_ traits: UITraitCollection) {
        let next = Preferences(
            colorScheme: Self.schemes[traits.userInterfaceStyle],
            fontScale: Self.fontScales[traits.preferredContentSizeCategory] ?? 1)
        let previous = lock.withLock { () -> Preferences in
            defer { preferences = next }
            return preferences
        }

        if previous != next { observers.values.forEach { $0(next) } }
    }

    /// Calls `observer` with each change until the returned token is cancelled.
    func observe(_ observer: @escaping (Preferences) -> Void) -> UUID {
        let token = UUID()

        observers[token] = observer

        return token
    }

    func cancel(_ token: UUID) {
        observers[token] = nil
    }

    private static let schemes: [UIUserInterfaceStyle: String] = [.light: "light", .dark: "dark"]

    /// React Native's multipliers for each Dynamic Type size, so a font scale
    /// means the same on both frameworks. `large` is the default.
    private static let fontScales: [UIContentSizeCategory: Double] = [
        .extraSmall: 0.823,
        .small: 0.882,
        .medium: 0.941,
        .large: 1,
        .extraLarge: 1.118,
        .extraExtraLarge: 1.235,
        .extraExtraExtraLarge: 1.353,
        .accessibilityMedium: 1.786,
        .accessibilityLarge: 2.143,
        .accessibilityExtraLarge: 2.643,
        .accessibilityExtraExtraLarge: 3.143,
        .accessibilityExtraExtraExtraLarge: 3.571,
    ]
}
