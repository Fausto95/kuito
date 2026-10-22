import UIKit

/// The release shell: the app alone. It holds no dev link, devtools or
/// LogBox, so nothing in it reaches a dev server; console output and
/// failures go to the system log, and errors and crashes to
/// `KuitoCrashReports` (docs/crash-reports.md). It runs the over-the-air
/// update it staged, if any, and looks for a newer one once the app drew
/// (docs/updates.md).
@MainActor
final class KuitoViewController: KuitoHostController {
    /// Chosen once per process, as the first controller starts: one the system
    /// makes again for a reconnected scene runs the same bytecode.
    private static let updates: KuitoUpdates? = {
        let updates = KuitoUpdates.bundled()

        KuitoCrashReports.shared.onFatal = { updates?.crashed() }

        let running = updates?.launch()

        KuitoAppBundle.update = running == nil ? nil : updates?.bundle
        KuitoCrashReports.shared.update = running?.id
        if let running { NSLog("[Kuito] Running the update %@", running.id) }

        return updates
    }()

    private var updates: KuitoUpdates? { Self.updates }

    override init() {
        KuitoCrashReports.shared.install()
        _ = Self.updates
        super.init()
    }

    override func firstFrame() {
        guard let updates else { return }

        updates.drew()

        Task.detached(priority: .utility) {
            do {
                if let staged = try await updates.check() { NSLog("[Kuito] Staged the update %@ for the next start", staged.id) }
            } catch let refused as KuitoUpdateError {
                NSLog("[Kuito] Refused an update: %@", refused.description)
            } catch {
                NSLog("[Kuito] Could not check for an update: %@", error.localizedDescription)
            }
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// An error the app logged or threw outside a caller: event handlers, timers, rejections.
    override func log(_ level: String, _ message: String, stack: String) {
        super.log(level, message, stack: stack)

        if level == "error" { KuitoCrashReports.shared.record(.javascript, fatal: false, message: message, stack: stack) }
    }

    /// A script that failed to run is fatal; a failure without a JavaScript stack is the shell's own.
    override func failed(_ what: String, _ error: Error? = nil, fatal: Bool = false) {
        super.failed(what, error, fatal: fatal)

        let (message, stack) = describe(what, error)

        KuitoCrashReports.shared.record(stack.isEmpty ? .native : .javascript, fatal: fatal, message: message, stack: stack)
    }
}
