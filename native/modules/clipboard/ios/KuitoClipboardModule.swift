import UIKit

/// `Clipboard` in native/modules/clipboard/clipboard.ts.
final class KuitoClipboardModule: ClipboardSpec {
    private var observers: [NSObjectProtocol] = []
    private var changeCount = 0

    init(context: KuitoModuleContext) {}

    // UIPasteboard is not main-actor bound; hasStrings reads no content, so
    // it never shows the paste prompt.
    func hasText() -> Bool {
        UIPasteboard.general.hasStrings
    }

    @MainActor func readText() -> String {
        UIPasteboard.general.string ?? ""
    }

    @MainActor func writeText(_ text: String) {
        UIPasteboard.general.string = text
    }

    // UIPasteboard.changedNotification covers this app's own writes; another
    // app's show up in changeCount when this one becomes active again.
    @MainActor func startHasText(_ signal: KuitoSignal<Bool>) {
        let center = NotificationCenter.default

        changeCount = UIPasteboard.general.changeCount
        observers = [UIPasteboard.changedNotification, UIApplication.didBecomeActiveNotification].map {
            center.addObserver(forName: $0, object: nil, queue: .main) { [weak self] _ in self?.changed(signal) }
        }
    }

    @MainActor func stopHasText() {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
    }

    private func changed(_ signal: KuitoSignal<Bool>) {
        let pasteboard = UIPasteboard.general

        guard pasteboard.changeCount != changeCount else { return }

        changeCount = pasteboard.changeCount
        signal.set(pasteboard.hasStrings)
    }
}
