import UIKit

/// `Brightness` in native/modules/brightness/brightness.ts. iOS has one brightness for the
/// whole device, so the module keeps the system's level and puts it back
/// whenever the app leaves the foreground or reloads.
final class KuitoBrightnessModule: BrightnessSpec {
    /// The system's level before the app's first change, and the app's level.
    private struct Override {
        let system: CGFloat
        var level: CGFloat
    }

    private var override: Override?
    private var observation: UUID?

    init(context: KuitoModuleContext) {}

    @MainActor func getBrightness() -> Double {
        Double(Self.screen?.brightness ?? 0)
    }

    @MainActor func setBrightness(_ level: Double) throws {
        try set(CGFloat(level))
    }

    @MainActor func restoreSystemBrightness() {
        restore()
    }

    @MainActor func isUsingSystemBrightness() -> Bool {
        override == nil
    }

    func destroy() {
        MainActor.assumeIsolated { restore() }
    }

    @MainActor private static var screen: UIScreen? {
        UIApplication.shared.connectedScenes.lazy.compactMap { ($0 as? UIWindowScene)?.screen }.first
    }

    @MainActor private func set(_ level: CGFloat) throws {
        guard let screen = Self.screen else { throw KuitoModuleError("ERR_BRIGHTNESS", "No screen to set") }

        if override == nil {
            override = Override(system: screen.brightness, level: level)
            observation = KuitoAppLifecycle.shared.observe { [weak self] event in self?.lifecycle(event) }
        }

        override?.level = level
        screen.brightness = level
    }

    @MainActor private func restore() {
        guard let override else { return }

        Self.screen?.brightness = override.system
        self.override = nil
        observation.map(KuitoAppLifecycle.shared.cancel)
        observation = nil
    }

    @MainActor private func lifecycle(_ event: KuitoAppLifecycle.Event) {
        guard case let .changed(state) = event, let override else { return }

        switch state {
        case .active: Self.screen?.brightness = override.level
        case .background: Self.screen?.brightness = override.system
        case .inactive: break
        }
    }
}
