import UIKit

/// `KeepAwake` in native/modules/keep-awake/keep-awake.ts. The idle timer
/// stays off while any tag holds it; a reload gives it back.
final class KuitoKeepAwakeModule: KeepAwakeSpec {
    private var tags: Set<String> = []

    init(context: KuitoModuleContext) {}

    @MainActor func activate(_ tag: String) {
        tags.insert(tag)
        apply()
    }

    @MainActor func deactivate(_ tag: String) {
        tags.remove(tag)
        apply()
    }

    func destroy() {
        MainActor.assumeIsolated {
            tags = []
            apply()
        }
    }

    @MainActor private func apply() {
        UIApplication.shared.isIdleTimerDisabled = !tags.isEmpty
    }
}
