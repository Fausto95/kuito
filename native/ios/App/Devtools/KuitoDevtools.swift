import UIKit

/// Everything the devtools show and toggle, observed by the sheet, the
/// performance monitor and the update highlighter. One instance per shell.
@MainActor
final class KuitoDevtools {
    struct Patch {
        let revision: Int
        let milliseconds: Double
        let date: Date
    }

    var url: URL { didSet { changed() } }
    var connection = KuitoConnectionState.connecting { didSet { changed() } }
    private(set) var patches: [Patch] = []
    private(set) var lastError: String? { didSet { changed() } }

    var showsPerformance = UserDefaults.standard.bool(forKey: "kuito.performance") {
        didSet {
            UserDefaults.standard.set(showsPerformance, forKey: "kuito.performance")
            changed()
        }
    }

    var highlightsUpdates = UserDefaults.standard.bool(forKey: "kuito.highlights") {
        didSet {
            UserDefaults.standard.set(highlightsUpdates, forKey: "kuito.highlights")
            changed()
        }
    }

    /// Actions the shell performs; set by the view controller.
    var reconnect: (() -> Void)?
    var reload: (() -> Void)?

    private var observers: [UUID: () -> Void] = [:]

    init(url: URL) {
        self.url = url
    }

    func patched(revision: Int, milliseconds: Double) {
        patches.insert(Patch(revision: revision, milliseconds: milliseconds, date: Date()), at: 0)
        patches = Array(patches.prefix(20))
        lastError = nil
        changed()
    }

    func failed(_ message: String) {
        lastError = message
    }

    func clearError() {
        lastError = nil
    }

    @discardableResult
    func observe(_ observer: @escaping () -> Void) -> UUID {
        let id = UUID()

        observers[id] = observer
        observer()

        return id
    }

    func unobserve(_ id: UUID) {
        observers.removeValue(forKey: id)
    }

    private func changed() {
        for observer in observers.values { observer() }
    }
}
