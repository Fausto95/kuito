import UIKit

/// `SystemUI` in native/modules/system-ui/system-ui.ts. The state lives in
/// `KuitoSystemBars`; the navigation bar and the status bar's color are
/// Android's, and resolve without effect here.
final class KuitoSystemUIModule: SystemUISpec {
    private let bars = KuitoSystemBars.shared

    init(context: KuitoModuleContext) {}

    @MainActor func setStatusBarStyle(_ style: StatusBarStyle, _ animated: Bool) {
        bars.statusBarStyle = switch style {
        case .default: bars.launchStatusBarStyle
        case .lightContent: .lightContent
        case .darkContent: .darkContent
        }
        bars.changed(animated: animated)
    }

    @MainActor func setStatusBarHidden(_ hidden: Bool, _ transition: StatusBarTransition) {
        bars.statusBarHidden = hidden
        bars.statusBarAnimation = switch transition {
        case .none: .none
        case .fade: .fade
        case .slide: .slide
        }
        bars.changed(animated: transition != .none)
    }

    @MainActor func setStatusBarBackgroundColor(_ color: String, _ animated: Bool) {}

    @MainActor func setStatusBarTranslucent(_ translucent: Bool) {}

    // UIKit reads the status bar's frame on the main thread only; React Native's is undefined here too.
    func statusBarHeight() -> Double? {
        nil
    }

    // Set before the runtime starts, so the JS thread reads a settled value.
    func statusBarHiddenAtLaunch() -> Bool {
        bars.launchStatusBarHidden
    }

    @MainActor func setBackgroundColor(_ color: String?) {
        bars.backgroundColor = color
        bars.changed()
    }

    @MainActor func setNavigationBarColor(_ color: String) {}

    @MainActor func setNavigationBarButtonStyle(_ style: NavigationBarButtonStyle) {}

    @MainActor func setNavigationBarHidden(_ hidden: Bool) {}

    @MainActor func setScreenEdgesDeferred(_ deferred: Bool) {
        bars.screenEdgesDeferred = deferred
        bars.changed()
    }

    @MainActor func setHomeIndicatorAutoHidden(_ hidden: Bool) {
        bars.homeIndicatorAutoHidden = hidden
        bars.changed()
    }

    func destroy() {
        MainActor.assumeIsolated { bars.reset() }
    }
}
