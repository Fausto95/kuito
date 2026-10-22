import UIKit
import XCTest

/// Frame receipts (docs/performance.md#frame-receipts): a frame that drops
/// keeps what ran in it, and names the job its layout was for.
@MainActor
final class KuitoFrameReceiptsTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private let interval = 1.0 / 60

    override func setUp() async throws {
        try KuitoCost.requireInstruments()
        KuitoFrameLedger.reset()
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: 1, kind: "Text", parent: 0, label: "title")
        try renderer.setProperty(id: 1, name: "text", value: .text("Hello"))
        container.layoutIfNeeded()
        _ = KuitoFrameLedger.frame(vsync: 0, interval: interval)
    }

    func testAForcedTwentyMillisecondLayoutLeavesLayoutReceiptsNamingItsJob() throws {
        let layout = try XCTUnwrap(renderer.nodes[1]).layout
        let measure = try XCTUnwrap(layout.measure)

        layout.measure = { width, widthMode, height, heightMode in
            let until = CACurrentMediaTime() + 0.020

            while CACurrentMediaTime() < until {}

            return measure(width, widthMode, height, heightMode)
        }

        KuitoFrameLedger.woke()
        KuitoFrameLedger.applyJob(42, event: "press", view: 1)
        try renderer.setProperty(id: 1, name: "text", value: .text("Hello again"))
        container.layoutIfNeeded()
        KuitoFrameLedger.slept()

        let verdict = KuitoFrameLedger.frame(vsync: 3 * interval, interval: interval)
        // The measure inside it has a receipt of its own kind; a pass may
        // calculate the root more than once.
        let slow = KuitoFrameLedger.lastDropReceipts.filter { $0["kind"] as? String == "layout" && ($0["ms"] as? Double ?? 0) >= 20 }

        XCTAssertGreaterThan(verdict.dropped, 0)
        XCTAssertFalse(slow.isEmpty, "\(KuitoFrameLedger.lastDropReceipts)")
        XCTAssertEqual(Set(slow.compactMap { $0["cause"] as? UInt64 }), [42])

        let line = KuitoFrameLedger.describeLastDrop { [renderer] id in renderer?.describe(id) ?? "?" }

        XCTAssertTrue(line.hasPrefix("Dropped \(verdict.dropped) frame"), line)
        XCTAssertTrue(line.contains("layout"), line)
        XCTAssertTrue(line.contains("← job 42 (press on Text title (1))"), line)
    }

    func testAFrameOnTimeKeepsNoDrop() throws {
        KuitoFrameLedger.woke()
        try renderer.setProperty(id: 1, name: "text", value: .text("Quick"))
        container.layoutIfNeeded()
        KuitoFrameLedger.slept()

        XCTAssertEqual(KuitoFrameLedger.frame(vsync: interval, interval: interval).dropped, 0)
        XCTAssertEqual(KuitoFrameLedger.dropSequence, 0)
    }
}
