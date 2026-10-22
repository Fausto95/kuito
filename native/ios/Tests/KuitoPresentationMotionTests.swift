import UIKit
import XCTest

/// A sheet's and a stack's motion sources (docs/motion.md#motion-sources):
/// once the app asks, each display frame that finds them moved sends where
/// they are, the first on the frame after the asking batch.
@MainActor
final class KuitoPresentationMotionTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private var sent: [String] = []

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        renderer.onEvent = { [unowned self] id, event, record in
            if event == "motion" { sent.append("\(id): \(record.numbers.map { String(format: "%g", $0) }.joined(separator: " "))") }

            return false
        }
    }

    func testASheetSendsItsHeightAndItsProgressBetweenItsSnapPoints() throws {
        try renderer.createView(id: 1, kind: "Sheet", parent: 0, label: "sheet")

        let motion = try XCTUnwrap(renderer.nodes[1]?.view as? KuitoSheetView).motion
        var height: CGFloat = 300

        motion.measure = { (height, 300, 600) }
        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(true))
        XCTAssertEqual(sent, [], "not inside the batch that asked")

        motion.frame()
        height = 450
        motion.frame()
        motion.frame()
        height = 200
        motion.frame()

        XCTAssertEqual(sent, ["1: 300 0", "1: 450 0.5", "1: 200 -0.333333"], "each frame it moved; below its lowest point while dragged down")

        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(false))
        height = 600
        motion.frame()
        XCTAssertEqual(sent.count, 3)
    }

    func testAStackSendsHowFarABackSwipeHasTakenItsTopScreen() throws {
        try renderer.createView(id: 1, kind: "NavigationStack", parent: 0, label: "stack")

        let motion = try XCTUnwrap(renderer.nodes[1]?.view as? KuitoNavigationStackView).motion
        var progress: CGFloat? = 0.25

        motion.measure = { progress }
        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(true))
        motion.frame()
        progress = 0.6
        motion.frame()
        progress = nil
        motion.frame()
        motion.frame()

        XCTAssertEqual(sent, ["1: 0.25", "1: 0.6", "1: 0"], "at rest once no transition runs")
    }
}
