import Foundation

/// The kernel and app the shell runs, as bytecode: the ones it embeds, or
/// the over-the-air update the release shell chose at launch (docs/updates.md).
enum KuitoAppBundle {
    /// The running update's directory; nil runs the embedded bytecode.
    @MainActor static var update: URL?

    @MainActor static func load() throws -> (bootstrap: Data, app: Data, modules: URL) {
        if let update {
            return (try Data(contentsOf: update.appendingPathComponent("bootstrap.hbc")),
                    try Data(contentsOf: update.appendingPathComponent("app.hbc")),
                    update.appendingPathComponent("modules", isDirectory: true))
        }

        guard let bootstrap = Bundle.main.url(forResource: "bootstrap", withExtension: "hbc"),
              let app = Bundle.main.url(forResource: "app", withExtension: "hbc"),
              let resources = Bundle.main.resourceURL else {
            throw KuitoModuleError("ERR_ASSETS", "Missing compiled Kuito assets")
        }

        return (try Data(contentsOf: bootstrap), try Data(contentsOf: app),
                resources.appendingPathComponent("Modules", isDirectory: true))
    }

    /// The UI kernel, `ui.hbc`, which the kernel asks for the first time the app
    /// needs the UI thread.
    @MainActor static func uiKernel() -> Data { shipped("ui") }

    /// A release build's UI bundle, `app-ui.hbc`, which the app asks for with
    /// its first UI-thread operations.
    @MainActor static func uiBundle() -> Data { shipped("app-ui") }

    /// A UI-thread script as bytecode: the update's when one runs, since the
    /// script that asks for it names it by hash. Empty when missing, which the
    /// UI runtime reports.
    @MainActor private static func shipped(_ name: String) -> Data {
        let file = update?.appendingPathComponent(name + ".hbc") ?? Bundle.main.url(forResource: name, withExtension: "hbc")
        return file.flatMap { try? Data(contentsOf: $0) } ?? Data()
    }

    /// Debug builds: the app's source, only to recognize the dev server's
    /// replay of the build the shell started with. Release builds carry none.
    static func appSource() throws -> String {
        guard let source = Bundle.main.url(forResource: "app", withExtension: "js") else {
            throw KuitoModuleError("ERR_ASSETS", "Missing the app's source, app.js")
        }

        return try String(contentsOf: source, encoding: .utf8)
    }
}

/// The runtime a background task runs in when no runtime is listening for
/// runs: the app launched for the task, or its UI never started
/// (docs/background-tasks.md). The kernel loads headless, so the app's
/// modules run and define their tasks but its UI does not mount. The module
/// whose runs it takes stops it once the last run ends.
@MainActor
final class KuitoHeadlessRuntime: NSObject {
    private static var current: KuitoHeadlessRuntime?

    /// Why the runtime could not start, for what waits on it to give up.
    static var failed: ((String) -> Void)?

    private var bridge: KuitoHermesBridge?

    static func start() {
        guard current == nil else { return }

        let runtime = KuitoHeadlessRuntime()

        current = runtime
        runtime.boot()
    }

    /// Nothing is left to run; none is running is fine.
    static func stop() {
        current?.bridge?.shutdown()
        current = nil
    }

    private func boot() {
        do {
            let bundle = try KuitoAppBundle.load()
            let bridge = try KuitoHermesBridge(link: KuitoLinker(KuitoLink.function, KuitoLink.observer), inspector: nil,
                                                modules: bundle.modules)

            bridge.delegate = self
            self.bridge = bridge
            NSLog("[Kuito] Starting a headless runtime for background tasks")
            evaluate(Data("globalThis.__kuitoHostHeadless = true;".utf8), url: "kuito://headless") { [weak self] in
                self?.evaluate(bundle.bootstrap, url: "kuito://bootstrap") { [weak self] in
                    self?.evaluate(bundle.app, url: "kuito://app") {}
                }
            }
        } catch {
            failed("Hermes failed to start", error)
        }
    }

    private func evaluate(_ script: Data, url: String, then next: @escaping () -> Void) {
        bridge?.evaluateScript(script, sourceURL: url) { [weak self] error in
            if let error { return self?.failed("\(url) threw", error) ?? () }

            next()
        }
    }

    /// Nothing can run the waiting tasks: end them now instead of at their deadline.
    private func failed(_ what: String, _ error: Error) {
        NSLog("[Kuito] Headless runtime: %@: %@", what, error.localizedDescription)
        Self.failed?("failed: the headless runtime did not start (\(what))")
        Self.stop()
    }
}

extension KuitoHeadlessRuntime: KuitoHermesBridgeDelegate {
    // A headless kernel mounts nothing; there is no view tree to apply a batch to.
    nonisolated func kuitoApplyBatch(_ batch: KuitoMutationBatch) {}

    nonisolated func kuitoDidCommitFrames() {}

    nonisolated func kuitoDidLog(_ level: String, message: String, stack: String) {
        NSLog("[%@] %@", level, message)
    }

    nonisolated func kuitoUIDidSetProps(_ props: KuitoMutationBatch) {}
}
