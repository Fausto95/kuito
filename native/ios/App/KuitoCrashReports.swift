import Foundation
import MetricKit

/// What a hosted crash service's adapter implements: an ordinary native
/// module that adds itself to `KuitoCrashReports` when the app starts it
/// (docs/crash-reports.md). Called on the main thread, once per report; only
/// `report` is main-actor, so the module's other members keep their threads.
protocol KuitoCrashReporter: AnyObject {
    @MainActor func report(_ report: KuitoCrashReport)
}

/// A crash or JavaScript error of a release shell, as it is stored and handed
/// on. `kuito symbolicate` reads the same JSON (src/cli/crash-reports.ts).
struct KuitoCrashReport: Codable, Sendable {
    enum Kind: String, Codable, Sendable {
        case javascript, native
    }

    struct App: Codable, Sendable {
        let id: String
        let version: String
        let build: String
        /// The over-the-air update it ran (docs/updates.md); absent for the bytecode it shipped with.
        let update: String?
    }

    let id: String
    let kind: Kind
    /// Whether the app stopped: a native crash, or a script that failed to run.
    let fatal: Bool
    let message: String
    let stack: String
    /// ISO 8601.
    let time: String
    let app: App
    let platform: String
    let os: String
    let device: String
}

/// The release shell's crash and JavaScript-error hook (docs/crash-reports.md).
/// A report is written to Application Support before anything else, so one
/// the process does not survive reaches the adapters at the next launch; it
/// is removed once an adapter has it. Native crashes come from MetricKit,
/// which delivers them at the next launch, and from uncaught Objective-C
/// exceptions, written as the process dies.
final class KuitoCrashReports: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    static let shared = KuitoCrashReports()

    /// The newest reports kept while no adapter takes them.
    private static let kept = 20
    nonisolated(unsafe) private static var previousHandler: (@convention(c) (NSException) -> Void)?

    /// Guards the directory: reports are written from any thread.
    private let lock = NSLock()
    /// A non-fatal report is written here, off the thread that hit it.
    private let writes = DispatchQueue(label: "dev.kuito.crash-reports")
    private var installed = false
    /// The last non-fatal error, so one thrown every frame is kept once.
    private var lastError: String?
    @MainActor private var reporters: [KuitoCrashReporter] = []
    /// The update this process runs, set once at launch before the app starts.
    nonisolated(unsafe) var update: String?
    /// A fatal crash of this process, as it is recorded: the updates count it against what ran.
    nonisolated(unsafe) var onFatal: (() -> Void)?

    private let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("kuito/crash-reports", isDirectory: true)

    /// Once, at launch: the release shell's controller calls it.
    func install() {
        lock.lock()
        defer { lock.unlock() }

        guard !installed else { return }

        installed = true
        Self.previousHandler = NSGetUncaughtExceptionHandler()
        NSSetUncaughtExceptionHandler { exception in
            KuitoCrashReports.shared.record(
                .native, fatal: true, message: "\(exception.name.rawValue): \(exception.reason ?? "")",
                stack: exception.callStackSymbols.joined(separator: "\n"))
            KuitoCrashReports.previousHandler?(exception)
        }
        MXMetricManager.shared.add(self)
        DispatchQueue.main.async { MainActor.assumeIsolated { self.deliver() } }
    }

    /// Adds an adapter: it gets the reports still waiting, then each new one.
    @MainActor func add(_ reporter: KuitoCrashReporter) {
        guard !reporters.contains(where: { $0 === reporter }) else { return }

        reporters.append(reporter)
        deliver()
    }

    @MainActor func remove(_ reporter: KuitoCrashReporter) {
        reporters.removeAll { $0 === reporter }
    }

    /// Writes a report now, from any thread, and hands it on from the main thread.
    /// `past` is a crash of an earlier run, which MetricKit delivers now.
    func record(_ kind: KuitoCrashReport.Kind, fatal: Bool, message: String, stack: String,
                time: Date = Date(), build: String? = nil, past: Bool = false) {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = ProcessInfo.processInfo.operatingSystemVersion
        let report = KuitoCrashReport(
            id: UUID().uuidString, kind: kind, fatal: fatal, message: message, stack: stack,
            time: ISO8601DateFormatter().string(from: time),
            app: .init(id: Bundle.main.bundleIdentifier ?? "",
                       version: info["CFBundleShortVersionString"] as? String ?? "",
                       build: build ?? info["CFBundleVersion"] as? String ?? "",
                       update: past ? nil : update),
            platform: "ios",
            os: "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
            device: Self.model)

        // A fatal report is written before the process ends; it is delivered at the next launch.
        if fatal {
            write(report, at: time)
            if !past { onFatal?() }
            return
        }

        writes.async {
            guard self.isNew(report) else { return }

            self.write(report, at: time)
            DispatchQueue.main.async { MainActor.assumeIsolated { self.deliver() } }
        }
    }

    // MetricKit's crash diagnostics of earlier runs, on a queue of its own.
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            for crash in payload.crashDiagnostics ?? [] {
                // An Objective-C exception was written by the handler as it happened.
                if #available(iOS 17.0, *), crash.exceptionReason != nil { continue }

                let cause = [crash.exceptionType.map { "exception \($0)" }, crash.signal.map { "signal \($0)" }]
                    .compactMap { $0 }.joined(separator: ", ")

                record(.native, fatal: true, message: [crash.terminationReason ?? "Crash", cause].filter { !$0.isEmpty }.joined(separator: ": "),
                       stack: String(data: crash.callStackTree.jsonRepresentation(), encoding: .utf8) ?? "",
                       time: payload.timeStampEnd, build: crash.metaData.applicationBuildVersion, past: true)
            }
        }

        DispatchQueue.main.async { MainActor.assumeIsolated { self.deliver() } }
    }

    private func isNew(_ report: KuitoCrashReport) -> Bool {
        let key = report.message + "\n" + report.stack

        defer { lastError = key }

        return key != lastError
    }

    private func write(_ report: KuitoCrashReport, at time: Date) {
        // An exception thrown while the lock was held must not hang the handler that records it.
        guard lock.lock(before: Date(timeIntervalSinceNow: 1)) else { return }
        defer { lock.unlock() }

        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            // Named by time, so the oldest sort first; `f` marks a fatal one, kept over the others.
            let name = String(format: "%013.0f-%@-%@.json", time.timeIntervalSince1970 * 1000,
                              report.fatal ? "f" : "n", report.id)

            try JSONEncoder().encode(report).write(to: directory.appendingPathComponent(name), options: .atomic)

            let files = pending()
            let excess = files.count - Self.kept
            let stale = files.filter { $0.lastPathComponent.contains("-n-") } + files.filter { $0.lastPathComponent.contains("-f-") }

            for file in stale.prefix(max(excess, 0)) { try? FileManager.default.removeItem(at: file) }
        } catch {
            NSLog("[Kuito] Could not keep a crash report: %@", error.localizedDescription)
        }
    }

    private func pending() -> [URL] {
        ((try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// Every waiting report to every adapter, oldest first. Each is removed
    /// before it is handed on, so an adapter that crashes on one does not see
    /// it again at every launch.
    @MainActor private func deliver() {
        guard !reporters.isEmpty else { return }

        lock.lock()
        let files = pending()
        lock.unlock()

        for file in files {
            let report = (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(KuitoCrashReport.self, from: $0) }

            try? FileManager.default.removeItem(at: file)

            if let report { for reporter in reporters { reporter.report(report) } }
        }
    }

    /// Like `iPhone18,2`.
    private static let model: String = {
        var system = utsname()
        uname(&system)

        return withUnsafeBytes(of: &system.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }()
}
