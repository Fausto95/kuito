import UIKit

/// App-wide accessibility: VoiceOver and Reduce Motion status, reported as
/// the app's `accessibility.status` event when asked and on every change;
/// announcements; screen reader focus; and live regions, which UIKit lacks.
@MainActor
final class KuitoAccessibilityMonitor {
    /// Views with accessibilityLiveRegion; each region is owned by its view's style.
    let liveRegions = NSHashTable<KuitoLiveRegion>.weakObjects()

    private let events: KuitoEventEmitter
    private var observers: [NSObjectProtocol] = []
    private var pendingRegions: [KuitoLiveRegion] = []

    init(events: KuitoEventEmitter) {
        self.events = events

        let center = NotificationCenter.default
        let status = [UIAccessibility.voiceOverStatusDidChangeNotification, UIAccessibility.reduceMotionStatusDidChangeNotification]

        observers = status.map { name in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.sendStatus() }
            }
        }
        observers.append(center.addObserver(forName: KuitoLabel.textDidChange, object: nil, queue: .main) { [weak self] note in
            let label = note.object as? UIView

            MainActor.assumeIsolated { self?.contentChanged(label) }
        })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    func sendStatus() {
        events.emit(0, "accessibility.status", KuitoAccessibilityStatusPayload(
            screenReaderEnabled: UIAccessibility.isVoiceOverRunning,
            reduceMotionEnabled: UIAccessibility.isReduceMotionEnabled
        ))
    }

    /// `{ message, queue }`: a queued announcement waits for current speech.
    func announce(_ argument: String) throws {
        guard let data = argument.data(using: .utf8),
              let options = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = options["message"] as? String else {
            throw KuitoRenderError.Rejection("expects { message, queue? }")
        }

        announce(message, queue: options["queue"] as? Bool ?? false)
    }

    func focus(_ view: UIView) {
        UIAccessibility.post(notification: .layoutChanged, argument: view)
    }

    private func announce(_ message: String, queue: Bool) {
        let announcement = NSAttributedString(string: message, attributes: [.accessibilitySpeechQueueAnnouncement: queue])

        UIAccessibility.post(notification: .announcement, argument: announcement)
    }

    /// Text changed inside a live region: once the batch has applied, the
    /// region announces what it now reads.
    private func contentChanged(_ view: UIView?) {
        guard let view else { return }

        let regions = liveRegions.allObjects.filter { region in
            region.view.map(view.isDescendant(of:)) == true && !pendingRegions.contains { $0 === region }
        }

        guard !regions.isEmpty else { return }

        if pendingRegions.isEmpty {
            DispatchQueue.main.async { [weak self] in self?.announceRegions() }
        }

        pendingRegions += regions
    }

    private func announceRegions() {
        for region in pendingRegions {
            guard let view = region.view, view.window != nil else { continue }

            let text = view.accessibilityLabel ?? KuitoAccessibility.childText(of: view) ?? (view as? UILabel)?.text

            if let text, !text.isEmpty { announce(text, queue: !region.assertive) }
        }

        pendingRegions.removeAll()
    }
}

/// accessibilityLiveRegion: `polite` waits for current speech, `assertive` interrupts it.
@MainActor
final class KuitoLiveRegion {
    weak var view: UIView?
    var assertive: Bool

    init(view: UIView, assertive: Bool) {
        self.view = view
        self.assertive = assertive
    }
}
