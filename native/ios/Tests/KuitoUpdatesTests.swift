import CryptoKit
import XCTest

/// Over-the-air updates (docs/updates.md#on-the-device): a shell takes only
/// an update signed with its key, for its app, platform and fingerprint,
/// newer than what it runs, and rolls back to the bytecode it shipped with
/// after a crash loop.
final class KuitoUpdatesTests: XCTestCase {
    private let key = P256.Signing.PrivateKey()
    private let fingerprint = String(repeating: "ab", count: 32)
    private let base = URL(string: "https://updates.example.com/reel")!
    private var directory: URL!
    /// What the host serves, by URL.
    private var served: [URL: Data] = [:]

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func shell(builtAt: Int64 = 1_000, fingerprint: String? = nil, publicKey: P256.Signing.PublicKey? = nil) -> KuitoUpdateShell {
        KuitoUpdateShell(app: "com.example.reel", url: base, publicKey: publicKey ?? key.publicKey,
                          fingerprint: fingerprint ?? self.fingerprint, builtAt: builtAt)
    }

    /// A new process: the shell as it starts again, reading what the last one left.
    private func updates(_ shell: KuitoUpdateShell? = nil) -> KuitoUpdates {
        let served = self.served

        return KuitoUpdates(shell: shell ?? self.shell(), directory: directory) { url, _ in served[url] }
    }

    private var manifestURL: URL {
        base.appendingPathComponent("ios").appendingPathComponent(fingerprint).appendingPathComponent("update.json")
    }

    private func hex(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    /// Publishes an update of one script; returns its id.
    @discardableResult
    private func publish(_ script: String, createdAt: Int64, path: String = "app.hbc", app: String = "com.example.reel", platform: String = "ios",
                         url: String = "https://updates.example.com/reel",
                         fingerprint: String? = nil, tamper: ((String) -> String)? = nil) throws -> String {
        let bytes = Data(script.utf8)
        let id = String(hex(Data("\(path) \(hex(bytes))\n".utf8)).prefix(16))
        let manifest: [String: Any] = [
            "format": 1, "id": id, "app": app, "platform": platform, "url": url, "fingerprint": fingerprint ?? self.fingerprint,
            "createdAt": createdAt, "files": [["path": path, "sha256": hex(bytes), "size": bytes.count]],
        ]
        let text = String(decoding: try JSONSerialization.data(withJSONObject: manifest), as: UTF8.self)
        let signature = try key.signature(for: Data(text.utf8)).derRepresentation.base64EncodedString()
        let envelope = ["manifest": tamper?(text) ?? text, "signature": signature]
        let folder = manifestURL.deletingLastPathComponent()

        served[manifestURL] = try JSONSerialization.data(withJSONObject: envelope)
        served[folder.appendingPathComponent(id).appendingPathComponent(path)] = bytes

        return id
    }

    private func script(of updates: KuitoUpdates) throws -> String? {
        try updates.bundle.map { String(decoding: try Data(contentsOf: $0.appendingPathComponent("app.hbc")), as: UTF8.self) }
    }

    private func assertRefused(_ expected: KuitoUpdateError, _ updates: KuitoUpdates, file: StaticString = #filePath, line: UInt = #line) async {
        do {
            _ = try await updates.check()
            XCTFail("the update was taken", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? KuitoUpdateError, expected, file: file, line: line)
        }
    }

    // MARK: - Applied on the next start

    func testAVerifiedUpdateIsStagedAndRunsFromTheNextStart() async throws {
        let id = try publish("one", createdAt: 2_000)
        let first = updates()

        XCTAssertNil(first.launch(), "nothing to run yet but the embedded bundle")

        let staged = try await first.check()

        XCTAssertEqual(staged?.id, id)
        XCTAssertNil(first.bundle, "the running process keeps what it started with")

        let second = updates()

        XCTAssertEqual(second.launch()?.id, id)
        XCTAssertEqual(try script(of: second), "one")
    }

    func testAnUpdateShipsTheUIKernelBesideTheKernel() async throws {
        let id = try publish("ui kernel", createdAt: 2_000, path: "ui.hbc")

        _ = try await updates().check()
        let next = updates()

        XCTAssertEqual(next.launch()?.id, id)
        let bundle = try XCTUnwrap(next.bundle)
        XCTAssertEqual(String(decoding: try Data(contentsOf: bundle.appendingPathComponent("ui.hbc")), as: UTF8.self), "ui kernel")
    }

    func testAnUpdateShipsTheAppUIBundleBesideTheApp() async throws {
        let id = try publish("ui bundle", createdAt: 2_000, path: "app-ui.hbc")

        _ = try await updates().check()
        let next = updates()

        XCTAssertEqual(next.launch()?.id, id)
        let bundle = try XCTUnwrap(next.bundle)
        XCTAssertEqual(String(decoding: try Data(contentsOf: bundle.appendingPathComponent("app-ui.hbc")), as: UTF8.self), "ui bundle")
    }

    func testTheUpdateAShellRunsServedAgainIsNothingNew() async throws {
        try publish("one", createdAt: 2_000)
        _ = updates().launch()
        _ = try await updates().check()

        let running = updates()

        _ = running.launch()

        let again = try await running.check()

        XCTAssertNil(again)
    }

    func testNoPublishedUpdateIsNothingNew() async throws {
        let updates = updates()

        _ = updates.launch()

        let found = try await updates.check()

        XCTAssertNil(found)
    }

    // MARK: - Refused

    func testATamperedManifestIsRefused() async throws {
        try publish("one", createdAt: 2_000) { $0.replacingOccurrences(of: "2000", with: "9000") }

        await assertRefused(.signature, updates())
    }

    func testAManifestSignedWithAnotherKeyIsRefused() async throws {
        try publish("one", createdAt: 2_000)

        await assertRefused(.signature, updates(shell(publicKey: P256.Signing.PrivateKey().publicKey)))
    }

    func testATamperedScriptIsRefused() async throws {
        let id = try publish("one", createdAt: 2_000)

        served[manifestURL.deletingLastPathComponent().appendingPathComponent(id).appendingPathComponent("app.hbc")] = Data("two".utf8)

        await assertRefused(.file("app.hbc"), updates())
        XCTAssertNil(updates().launch(), "nothing was staged")
    }

    func testAnOlderUpdateServedAgainIsRefused() async throws {
        try publish("new", createdAt: 3_000)
        _ = try await updates().check()
        try publish("old", createdAt: 2_000)

        await assertRefused(.stale, updates())
    }

    func testAnUpdateOlderThanTheEmbeddedBytecodeIsRefused() async throws {
        try publish("old", createdAt: 900)

        await assertRefused(.stale, updates(shell(builtAt: 1_000)))
    }

    func testAnUpdateForAnotherAppOrPlatformIsRefused() async throws {
        try publish("one", createdAt: 2_000, app: "com.example.other")
        await assertRefused(.otherApp, updates())

        try publish("one", createdAt: 2_000, platform: "android")
        await assertRefused(.otherPlatform, updates())
    }

    func testAnUpdateForAnotherHostIsRefused() async throws {
        // A staging update, signed with the same key, served where production looks.
        try publish("one", createdAt: 2_000, url: "https://updates.example.com/reel-staging")

        await assertRefused(.otherHost, updates())
    }

    func testAnUpdateForAnotherShellIsRefused() async throws {
        try publish("one", createdAt: 2_000, fingerprint: String(repeating: "cd", count: 32))

        await assertRefused(.incompatible, updates())
    }

    func testAnUpdateTheCLISignedVerifies() throws {
        let fixture = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("../../../test/fixtures/updates/ios.json").standardized
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as? [String: Any])
        let publicKey = try P256.Signing.PublicKey(derRepresentation: XCTUnwrap(Data(base64Encoded: XCTUnwrap(json["publicKey"] as? String))))
        let envelope = try JSONSerialization.data(withJSONObject: XCTUnwrap(json["envelope"]))
        let manifest = try KuitoUpdates.verify(envelope, for: shell(builtAt: 0, publicKey: publicKey))

        XCTAssertEqual(manifest.files.map(\.path), ["app.hbc"])
        XCTAssertEqual(manifest.createdAt, 1_761_134_400_000)
    }

    // MARK: - Rollback

    func testACrashLoopRollsBackToTheEmbeddedBytecode() async throws {
        let id = try publish("bad", createdAt: 2_000)

        _ = updates().launch()
        _ = try await updates().check()

        for _ in 0..<KuitoUpdates.crashLoop {
            let crashing = updates()

            XCTAssertEqual(crashing.launch()?.id, id)
            crashing.drew()
            crashing.crashed()
        }

        let recovered = updates()

        XCTAssertNil(recovered.launch(), "back to the embedded bytecode")
        await assertRefused(.rolledBack, recovered)
    }

    func testALaunchThatNeverDrawsCountsAsACrash() async throws {
        try publish("hangs", createdAt: 2_000)
        _ = updates().launch()
        _ = try await updates().check()

        for _ in 0..<KuitoUpdates.crashLoop { XCTAssertNotNil(updates().launch()) }

        XCTAssertNil(updates().launch())
    }

    func testAHealthyLaunchClearsTheCount() async throws {
        let id = try publish("flaky", createdAt: 2_000)

        _ = updates().launch()
        _ = try await updates().check()

        for crashes in [true, false, true] {
            let launched = updates()

            XCTAssertEqual(launched.launch()?.id, id)
            launched.drew()
            if crashes { launched.crashed() }
        }

        XCTAssertEqual(updates().launch()?.id, id)
    }

    func testAScriptChangedOnDiskFallsBackToTheEmbeddedBytecode() async throws {
        try publish("one", createdAt: 2_000)
        _ = updates().launch()
        _ = try await updates().check()

        let running = updates()
        let bundle = try XCTUnwrap({ _ = running.launch(); return running.bundle }())

        try Data("evil".utf8).write(to: bundle.appendingPathComponent("app.hbc"))

        XCTAssertNil(updates().launch())
    }

    func testANewShellStartsFromItsOwnBytecode() async throws {
        try publish("one", createdAt: 2_000)
        _ = updates().launch()
        _ = try await updates().check()

        XCTAssertNil(updates(shell(builtAt: 1_500)).launch(), "a store build replaced the shell")
    }
}
