import CryptoKit
import Foundation

/// Why a shell refused an update (docs/updates.md#on-the-device).
enum KuitoUpdateError: Error, Equatable, CustomStringConvertible {
    /// Not an envelope or a manifest of the format this shell reads.
    case malformed(String)
    /// The signature does not verify with the shell's public key.
    case signature
    case otherApp
    case otherPlatform
    /// Published for another `updates.url`, like a staging update signed with the same key.
    case otherHost
    /// Made for another shell: native code this one lacks.
    case incompatible
    /// No newer than what the shell runs or ran: replayed, or a downgrade.
    case stale
    /// The shell rolled it back after a crash loop.
    case rolledBack
    /// A script missing, or not the size and hash the manifest signed.
    case file(String)

    var description: String {
        switch self {
        case .malformed(let what): "not an update: \(what)"
        case .signature: "its signature does not verify with this shell's key"
        case .otherApp: "it is for another app"
        case .otherPlatform: "it is for another platform"
        case .otherHost: "it was published for another host"
        case .incompatible: "it was built for another shell"
        case .stale: "it is no newer than what this shell runs"
        case .rolledBack: "this shell rolled it back after a crash loop"
        case .file(let path): "\(path) is not the script its manifest signed"
        }
    }
}

/// A manifest whose signature verified (src/cli/update-signing.ts writes it).
struct KuitoUpdateManifest: Equatable, Sendable {
    struct File: Equatable, Sendable {
        let path: String
        let sha256: String
        let size: Int
    }

    let id: String
    let app: String
    let platform: String
    let url: String
    let fingerprint: String
    let createdAt: Int64
    let files: [File]
}

/// What the shell was built with: the updates it takes must match it.
struct KuitoUpdateShell: Sendable {
    let app: String
    let url: URL
    let publicKey: P256.Signing.PublicKey
    let fingerprint: String
    /// When its embedded bytecode was built, in milliseconds since 1970.
    let builtAt: Int64

    /// `kuito-updates.json` in the bundle (src/cli/updates.ts); nil when the build takes no updates.
    static func bundled() throws -> KuitoUpdateShell? {
        guard let file = Bundle.main.url(forResource: "kuito-updates", withExtension: "json") else { return nil }

        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]

        guard let url = (json?["url"] as? String).flatMap(URL.init(string:)),
              let key = (json?["publicKey"] as? String).flatMap({ Data(base64Encoded: $0) }),
              let fingerprint = json?["fingerprint"] as? String,
              let builtAt = (json?["builtAt"] as? NSNumber)?.int64Value else {
            throw KuitoUpdateError.malformed("kuito-updates.json")
        }

        return KuitoUpdateShell(app: Bundle.main.bundleIdentifier ?? "", url: url,
                                 publicKey: try P256.Signing.PublicKey(derRepresentation: key),
                                 fingerprint: fingerprint, builtAt: builtAt)
    }
}

/// The release shell's over-the-air updates (docs/updates.md): at launch,
/// the bytecode to run, an update staged by an earlier launch or the one
/// the shell shipped with; after the first frame, a check for a newer one,
/// staged for the next start. Every update is verified twice: when it is
/// fetched, and from disk at each launch that runs it.
///
/// A launch that crashes, as the crash hook reports, or that never draws
/// counts against the update it ran; `crashLoop` of them in a row roll it
/// back, and it is refused from then on.
final class KuitoUpdates: @unchecked Sendable {
    /// Returns what the URL serves, nil when it serves nothing (a 404), at most `limit` bytes.
    typealias Fetch = @Sendable (_ url: URL, _ limit: Int) async throws -> Data?

    /// Launches in a row that crash before an update is rolled back: one may be bad luck.
    static let crashLoop = 2
    /// The most a manifest's envelope may be; a few hundred scripts' hashes.
    private static let envelopeLimit = 256 * 1024
    private static let formats: Set<Int> = [1]
    private static let hex = #/[0-9a-f]{64}/#
    private static let id = #/[0-9a-f]{16}/#
    // What a shell loads: the kernels, the root chunk, its UI bundle, and chunks by name (src/cli/device-assets.ts).
    private static let script = #/bootstrap\.hbc|ui\.hbc|app\.hbc|app-ui\.hbc|modules\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.hbc/#

    let shell: KuitoUpdateShell
    private let directory: URL
    private let fetch: Fetch
    /// Guards the state file: the crash hook writes it from any thread.
    private let lock = NSLock()
    /// What this process runs, decided by `launch`.
    private(set) var running: KuitoUpdateManifest?

    /// The running update's directory, nil for the embedded bytecode.
    var bundle: URL? { running.map { folder($0.id) } }

    init(shell: KuitoUpdateShell, directory: URL, fetch: @escaping Fetch = KuitoUpdates.http) {
        self.shell = shell
        self.directory = directory
        self.fetch = fetch
    }

    /// The shell's updates in Application Support, checked by the bundle's settings; nil when it takes none.
    static func bundled() -> KuitoUpdates? {
        do {
            guard let shell = try KuitoUpdateShell.bundled() else { return nil }

            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]

            return KuitoUpdates(shell: shell, directory: support.appendingPathComponent("kuito/updates", isDirectory: true))
        } catch {
            NSLog("[Kuito] Updates are off: %@", String(describing: error))
            return nil
        }
    }

    // MARK: - State

    private struct State: Codable {
        struct Launch: Codable {
            var update: String?
            var drew = false
            var crashed = false
        }

        /// The shell the rest is for: a store build starts over.
        var shell: String
        /// The newest `createdAt` this shell took, or its embedded bytecode's.
        var newest: Int64
        var current: String?
        var staged: String?
        var refused: [String] = []
        var crashes = 0
        var launch: Launch?
    }

    private var identity: String { "\(shell.fingerprint)@\(shell.builtAt)" }
    private var stateFile: URL { directory.appendingPathComponent("state.json") }
    private func folder(_ id: String) -> URL { directory.appendingPathComponent(id, isDirectory: true) }

    private func read() -> State {
        let fresh = State(shell: identity, newest: shell.builtAt)

        guard let data = try? Data(contentsOf: stateFile) else { return fresh }

        guard let state = try? JSONDecoder().decode(State.self, from: data), state.shell == identity else {
            // Another shell's updates: none of them fits this one.
            try? FileManager.default.removeItem(at: directory)
            return fresh
        }

        return state
    }

    private func write(_ state: State) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(state).write(to: stateFile, options: .atomic)
        } catch {
            NSLog("[Kuito] Could not keep the updates' state: %@", error.localizedDescription)
        }
    }

    private func change(_ body: (inout State) -> Void) {
        lock.lock()
        defer { lock.unlock() }

        var state = read()

        body(&state)
        write(state)
    }

    // MARK: - Launch

    /// Once, before the engine starts: the update this launch runs, nil for the embedded bytecode.
    @discardableResult
    func launch() -> KuitoUpdateManifest? {
        var chosen: String?

        // Recorded before the update is read: a crash while it is, counts against it.
        change { state in
            if let last = state.launch, let update = last.update, update == state.current {
                state.crashes = last.crashed || !last.drew ? state.crashes + 1 : 0

                if state.crashes >= Self.crashLoop {
                    NSLog("[Kuito] Rolled back the update %@: %d launches in a row crashed", update, state.crashes)
                    state.refused.append(update)
                    state.current = nil
                    state.crashes = 0
                    try? FileManager.default.removeItem(at: folder(update))
                }
            }

            if let staged = state.staged {
                if let current = state.current { try? FileManager.default.removeItem(at: folder(current)) }

                state.current = staged
                state.staged = nil
                state.crashes = 0
            }

            // A download a killed process left half done.
            let entries = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []

            for entry in entries where entry.lastPathComponent.hasPrefix("staging-") { try? FileManager.default.removeItem(at: entry) }

            chosen = state.current
            state.launch = .init(update: chosen)
        }

        running = nil

        guard let chosen else { return nil }

        do {
            running = try verifiedOnDisk(chosen)
        } catch {
            NSLog("[Kuito] The update %@ on disk is damaged, %@: running the embedded bytecode", chosen, String(describing: error))
            change { state in
                try? FileManager.default.removeItem(at: folder(chosen))
                if state.current == chosen { state.current = nil }
                state.launch = .init(update: nil)
            }
        }

        return running
    }

    /// The app drew its first frame.
    func drew() {
        change { $0.launch?.drew = true }
    }

    /// The crash hook recorded this process's fatal crash; it may be dying, so this writes at once.
    func crashed() {
        // A crash while the lock was held must not hang the handler that reports it.
        guard lock.lock(before: Date(timeIntervalSinceNow: 1)) else { return }
        defer { lock.unlock() }

        var state = read()

        state.launch?.crashed = true
        write(state)
    }

    private func verifiedOnDisk(_ id: String) throws -> KuitoUpdateManifest {
        let folder = folder(id)
        let manifest = try Self.verify(Data(contentsOf: folder.appendingPathComponent("update.json")), for: shell)

        guard manifest.id == id else { throw KuitoUpdateError.malformed("update.json is another update's") }

        for file in manifest.files { try Self.check(try? Data(contentsOf: folder.appendingPathComponent(file.path)), against: file) }

        return manifest
    }

    // MARK: - Check

    /// Fetches the newest update for this shell, verifies it and stages it for
    /// the next start: the manifest staged, or nil when none is newer.
    func check() async throws -> KuitoUpdateManifest? {
        let home = shell.url.appendingPathComponent("ios").appendingPathComponent(shell.fingerprint)

        guard let envelope = try await fetch(home.appendingPathComponent("update.json"), Self.envelopeLimit) else { return nil }

        let manifest = try Self.verify(envelope, for: shell)
        lock.lock()
        let state = read()
        lock.unlock()

        if state.refused.contains(manifest.id) { throw KuitoUpdateError.rolledBack }
        if manifest.id == state.current || manifest.id == state.staged { return nil }
        guard manifest.createdAt > state.newest else { throw KuitoUpdateError.stale }

        let staging = directory.appendingPathComponent("staging-\(manifest.id)", isDirectory: true)

        try? FileManager.default.removeItem(at: staging)
        defer { try? FileManager.default.removeItem(at: staging) }

        for file in manifest.files {
            let data = try await fetch(home.appendingPathComponent(manifest.id).appendingPathComponent(file.path), file.size)
            let target = staging.appendingPathComponent(file.path)

            try Self.check(data, against: file)
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data?.write(to: target)
        }

        try envelope.write(to: staging.appendingPathComponent("update.json"))

        var staged = false

        change { state in
            // Checked again: another check may have staged a newer one meanwhile.
            guard manifest.createdAt > state.newest, !state.refused.contains(manifest.id) else { return }

            let target = folder(manifest.id)

            try? FileManager.default.removeItem(at: target)

            guard (try? FileManager.default.moveItem(at: staging, to: target)) != nil else { return }

            if let old = state.staged, old != state.current { try? FileManager.default.removeItem(at: folder(old)) }

            state.staged = manifest.id
            state.newest = manifest.createdAt
            staged = true
        }

        return staged ? manifest : nil
    }

    private static func check(_ data: Data?, against file: KuitoUpdateManifest.File) throws {
        guard let data, data.count == file.size,
              SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == file.sha256 else {
            throw KuitoUpdateError.file(file.path)
        }
    }

    // MARK: - Verification

    /// The manifest of an envelope the shell's key signed, for its app,
    /// platform and fingerprint. Untrusted until here.
    static func verify(_ envelope: Data, for shell: KuitoUpdateShell) throws -> KuitoUpdateManifest {
        guard let json = try? JSONSerialization.jsonObject(with: envelope) as? [String: Any],
              let text = json["manifest"] as? String, let signed = json["signature"] as? String else {
            throw KuitoUpdateError.malformed("an envelope holds a manifest and its signature")
        }

        guard let der = Data(base64Encoded: signed),
              let signature = try? P256.Signing.ECDSASignature(derRepresentation: der),
              shell.publicKey.isValidSignature(signature, for: Data(text.utf8)) else {
            throw KuitoUpdateError.signature
        }

        let manifest = try parse(Data(text.utf8))

        guard manifest.app == shell.app else { throw KuitoUpdateError.otherApp }
        guard manifest.platform == "ios" else { throw KuitoUpdateError.otherPlatform }
        guard manifest.url == shell.url.absoluteString else { throw KuitoUpdateError.otherHost }
        guard manifest.fingerprint == shell.fingerprint else { throw KuitoUpdateError.incompatible }

        return manifest
    }

    private static func parse(_ data: Data) throws -> KuitoUpdateManifest {
        func fail(_ what: String) -> KuitoUpdateError { .malformed(what) }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw fail("a manifest is an object") }
        guard let format = json["format"] as? Int, formats.contains(format) else { throw fail("format") }
        guard let id = json["id"] as? String, id.wholeMatch(of: Self.id) != nil else { throw fail("id") }
        guard let app = json["app"] as? String, let platform = json["platform"] as? String,
              let url = json["url"] as? String else { throw fail("app, platform and url") }
        guard let fingerprint = json["fingerprint"] as? String, fingerprint.wholeMatch(of: hex) != nil else { throw fail("fingerprint") }
        guard let createdAt = (json["createdAt"] as? NSNumber)?.int64Value, createdAt > 0 else { throw fail("createdAt") }
        guard let listed = json["files"] as? [[String: Any]], !listed.isEmpty else { throw fail("files") }

        var seen = Set<String>()
        let files = try listed.map { file in
            guard let path = file["path"] as? String, path.wholeMatch(of: script) != nil, seen.insert(path).inserted,
                  let sha256 = file["sha256"] as? String, sha256.wholeMatch(of: hex) != nil,
                  let size = file["size"] as? Int, size >= 0 else {
                throw fail("a file is a script's path, its sha256 and its size")
            }

            return KuitoUpdateManifest.File(path: path, sha256: sha256, size: size)
        }

        return KuitoUpdateManifest(id: id, app: app, platform: platform, url: url, fingerprint: fingerprint,
                                    createdAt: createdAt, files: files)
    }

    // MARK: - Fetch

    /// The default seam: a GET over https, past any cache, failing on anything but 200 or 404.
    static let http: Fetch = { url, limit in
        // 30 s without a byte, not for the whole download: a large update on a slow network still finishes.
        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        // To a file, not memory: a host may serve anything, and only what fits the limit is read.
        let (file, response) = try await URLSession.shared.download(for: request)

        defer { try? FileManager.default.removeItem(at: file) }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if status == 404 { return nil }
        guard status == 200 else { throw URLError(.badServerResponse) }

        let size = try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int ?? .max

        guard size <= limit else { throw URLError(.dataLengthExceedsMaximum) }

        return try Data(contentsOf: file)
    }
}
