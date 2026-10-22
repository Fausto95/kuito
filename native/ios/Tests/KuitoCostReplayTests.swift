import QuartzCore
import UIKit
import XCTest

/// Cost replay (docs/devtools.md#cost-replay): the S1–S5 recordings in
/// test/fixtures/recordings/ios replay through the renderer with their
/// original timing, and each prints the line scripts/bisect-frame-cost.ts
/// reads. `TEST_RUNNER_KUITO_RECORDING=<file.krec>` replays one of your own.
@MainActor
final class KuitoCostReplayTests: XCTestCase {
    private var window: UIWindow!
    private var renderer: KuitoUIKitRenderer!
    private var container: UIView!

    override func setUp() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene, "the test host's scene")
        let host = UIViewController()

        window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        container = host.view
        renderer = KuitoUIKitRenderer(container: container)
    }

    override func tearDown() async throws {
        renderer.clear()
        window.isHidden = true
        window = nil
    }

    private func fixture(_ name: String) throws -> Data {
        try Data(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../test/fixtures/recordings/ios/\(name).krec").standardized)
    }

    private func replay(_ name: String, _ file: Data) async throws -> KuitoCostReplay.Report {
        let report = try await KuitoCostReplay.run(
            name, try KuitoReplayBatch.batches(ofRecording: file), renderer: renderer, container: container
        )

        print(report.line)
        for drop in report.drops { print("kuito-cost-replay ios \(name) \(drop)") }

        return report
    }

    func testAReplayAppliesEveryBatchOfItsRecording() async throws {
        let file = try fixture("s1-tap")
        let batches = try KuitoReplayBatch.batches(ofRecording: file)
        let report = try await replay("s1-tap", file)

        XCTAssertEqual(report.batches, batches.count)
        XCTAssertEqual(report.records, batches.reduce(0) { $0 + $1.batch.count })
        XCTAssertFalse(renderer.nodes.isEmpty, "the recording's views are on screen")
    }

    func testAReplayKeepsTheTimeBetweenItsBatches() async throws {
        let file = try fixture("s1-tap")
        let batches = try KuitoReplayBatch.batches(ofRecording: file)
        let span = try XCTUnwrap(batches.last).ms - (try XCTUnwrap(batches.first).ms)
        let began = CACurrentMediaTime()

        _ = try await replay("s1-tap", file)

        XCTAssertGreaterThanOrEqual((CACurrentMediaTime() - began) * 1000, span)
    }

    /// Counts (docs/performance.md#cost-counters) and drops (#frame-receipts)
    /// are what a bisect can judge a replay by without timing's noise.
    func testAReplayCountsItsWorkAndTheFramesItDropped() async throws {
        let report = try await replay("s1-tap", try fixture("s1-tap"))

        XCTAssertEqual(report.cost.recordsApplied, report.records)
        XCTAssertGreaterThan(report.cost.viewsCreated, 0)
        XCTAssertGreaterThan(report.cost.nodesFramed, 0)
        XCTAssertLessThanOrEqual(report.drops.count, report.dropped, "a drop's report covers one frame or more")
        XCTAssertTrue(report.line.contains(" dropped=\(report.dropped) "), report.line)
        XCTAssertTrue(report.line.contains(" nodesFramed=\(report.cost.nodesFramed)"), report.line)
    }

    func testAFileThatIsNotARecordingDoesNotReplay() {
        XCTAssertThrowsError(try KuitoReplayBatch.batches(ofRecording: Data("not a recording".utf8))) { error in
            XCTAssertTrue(error.localizedDescription.contains("KUITO_RECORDING"), error.localizedDescription)
        }
    }

    func testCostOfS1TapAPressable() async throws {
        _ = try await replay("s1-tap", try fixture("s1-tap"))
    }

    func testCostOfS2PushAndPopAScreen() async throws {
        _ = try await replay("s2-push-pop", try fixture("s2-push-pop"))
    }

    func testCostOfS3OpenAndDragASheet() async throws {
        _ = try await replay("s3-sheet", try fixture("s3-sheet"))
    }

    func testCostOfS4ScrollALongList() async throws {
        _ = try await replay("s4-scroll", try fixture("s4-scroll"))
    }

    func testCostOfS5TypeInATextField() async throws {
        _ = try await replay("s5-type", try fixture("s5-type"))
    }

    func testCostOfYourRecording() async throws {
        guard let path = ProcessInfo.processInfo.environment["KUITO_RECORDING"] else {
            throw XCTSkip("set TEST_RUNNER_KUITO_RECORDING to a .krec to replay it")
        }

        let url = URL(fileURLWithPath: path)

        _ = try await replay(url.deletingPathExtension().lastPathComponent, try Data(contentsOf: url))
    }
}
