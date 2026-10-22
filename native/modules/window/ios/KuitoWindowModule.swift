import Foundation

/// `Window` in native/modules/window/window.ts.
final class KuitoWindowModule: WindowSpec {
    private var observation: UUID?

    init(context: KuitoModuleContext) {}

    func metrics() -> WindowMetrics {
        WindowMetrics(KuitoWindowMetrics.shared.current)
    }

    @MainActor func startMetrics(_ signal: KuitoSignal<WindowMetrics>) {
        observation = KuitoWindowMetrics.shared.observe { signal.set(WindowMetrics($0)) }
    }

    @MainActor func stopMetrics() {
        observation.map(KuitoWindowMetrics.shared.cancel)
        observation = nil
    }
}

private extension WindowMetrics {
    init(_ metrics: KuitoWindowMetrics.Metrics) {
        let insets = metrics.insets

        self.init(
            width: metrics.width,
            height: metrics.height,
            insets: WindowInsets(top: insets.top, left: insets.left, bottom: insets.bottom, right: insets.right),
            orientation: WindowOrientation(rawValue: metrics.orientation) ?? .portrait)
    }
}
