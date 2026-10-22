import Foundation

/// `Appearance` in native/modules/appearance/appearance.ts.
final class KuitoAppearanceModule: AppearanceSpec {
    private var observations: [String: UUID] = [:]

    init(context: KuitoModuleContext) {}

    func colorScheme() -> ColorSchemeName? {
        KuitoTraits.shared.current.colorScheme.flatMap(ColorSchemeName.init(rawValue:))
    }

    func fontScale() -> Double {
        KuitoTraits.shared.current.fontScale
    }

    @MainActor func startColorScheme(_ signal: KuitoSignal<ColorSchemeName?>) {
        observe("colorScheme") { [weak self] _ in self.map { signal.set($0.colorScheme()) } }
    }

    @MainActor func stopColorScheme() {
        stop("colorScheme")
    }

    @MainActor func startFontScale(_ signal: KuitoSignal<Double>) {
        observe("fontScale") { [weak self] _ in self.map { signal.set($0.fontScale()) } }
    }

    @MainActor func stopFontScale() {
        stop("fontScale")
    }

    @MainActor private func observe(_ key: String, _ changed: @escaping (KuitoTraits.Preferences) -> Void) {
        observations[key] = KuitoTraits.shared.observe(changed)
    }

    @MainActor private func stop(_ key: String) {
        observations.removeValue(forKey: key).map(KuitoTraits.shared.cancel)
    }
}
