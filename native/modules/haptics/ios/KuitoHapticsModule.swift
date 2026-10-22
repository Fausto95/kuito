import CoreHaptics
import UIKit

/// `Haptics` in native/modules/haptics/haptics.ts.
final class KuitoHapticsModule: HapticsSpec {
    init(context: KuitoModuleContext) {}

    func isSupported() -> Bool {
        CHHapticEngine.capabilitiesForHardware().supportsHaptics
    }

    @MainActor func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    @MainActor func impact(_ style: ImpactStyle) {
        UIImpactFeedbackGenerator(style: style.feedback).impactOccurred()
    }

    @MainActor func notification(_ type: NotificationType) {
        UINotificationFeedbackGenerator().notificationOccurred(type.feedback)
    }
}

private extension ImpactStyle {
    var feedback: UIImpactFeedbackGenerator.FeedbackStyle {
        switch self {
        case .light: return .light
        case .medium: return .medium
        case .heavy: return .heavy
        }
    }
}

private extension NotificationType {
    var feedback: UINotificationFeedbackGenerator.FeedbackType {
        switch self {
        case .success: return .success
        case .warning: return .warning
        case .error: return .error
        }
    }
}
