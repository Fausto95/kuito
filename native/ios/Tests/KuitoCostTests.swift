import UIKit
import XCTest

/// The renderer's cost counters (docs/performance.md#cost-counters): wasted
/// work is found, and an interaction's cost stays within its budget. A budget
/// in XCTExpectFailure states the count a fix in the frame-drops plan must
/// reach; once it does, the expectation fails and the budget is tightened.
@MainActor
final class KuitoCostTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    private var renderer: KuitoUIKitRenderer!
    private let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))

    override func setUp() async throws {
        try KuitoCost.requireInstruments()
        renderer = KuitoUIKitRenderer(container: container)
        window.addSubview(container)
        window.isHidden = false
    }

    override func tearDown() async throws {
        window.isHidden = true
    }

    /// A Pressable with a label, then 100 labels: the screen S1 taps.
    private func feed() throws {
        try renderer.createView(id: 1, kind: "Pressable", parent: 0, label: "like")
        try renderer.setProperty(id: 1, name: "backgroundColor", value: .color(0x2a2a2aff))
        try renderer.createView(id: 2, kind: "Text", parent: 1, label: "like-label")
        try renderer.setProperty(id: 2, name: "text", value: .text("Like"))
        try renderer.createView(id: 3, kind: "VStack", parent: 0, label: "labels")

        for index in 0..<100 {
            let id = UInt32(10 + index)

            try renderer.createView(id: id, kind: "Text", parent: 3, label: "label-\(index)")
            try renderer.setProperty(id: id, name: "text", value: .text("Label \(index)"))
        }

        settle()
    }

    func testTheSameColorTwiceIsOneEffectiveWriteAndOneWasted() throws {
        try renderer.createView(id: 1, kind: "Box", parent: 0, label: "box")

        let cost = try costOf {
            try renderer.setProperty(id: 1, name: "backgroundColor", value: .color(0xff0000ff))
            try renderer.setProperty(id: 1, name: "backgroundColor", value: .color(0xff0000ff))
        }

        XCTAssertEqual(cost.propWrites, 2)
        XCTAssertEqual(cost.wastedPropWrites, 1)
        XCTAssertEqual(cost.recordsApplied, 2)
    }

    func testALayoutWithNoChangeSetsNoFrame() throws {
        try feed()

        let cost = costOf { container.subviews.forEach { $0.setNeedsLayout() } }

        XCTAssertEqual(cost.layoutPasses, 1)
        XCTAssertEqual(cost.wastedLayoutPasses, 1)
        XCTAssertGreaterThan(cost.nodesFramed, 100)
        XCTAssertEqual(cost.wastedFrames, cost.nodesFramed)
    }

    func testANewTextRedrawsItsLabelAndARedrawOfTheSameIsWasted() throws {
        try feed()

        let changed = try costOf { try renderer.setProperty(id: 60, name: "text", value: .text("Renamed")) }

        XCTAssertEqual(changed.labelRedraws, 1)
        XCTAssertEqual(changed.wastedRedraws, 0)
        XCTAssertGreaterThan(changed.measureCalls, 0)

        let label = try XCTUnwrap(renderer.nodes[60]?.view)
        let again = costOf { label.setNeedsDisplay() }

        XCTAssertEqual(again.labelRedraws, 1)
        XCTAssertEqual(again.wastedRedraws, 1)
    }

    func testCreatingAViewCountsIt() throws {
        let cost = try costOf {
            try renderer.createView(id: 1, kind: "Box", parent: 0, label: "box")
            try renderer.createView(id: 2, kind: "VStack", parent: 1, label: "flat", flattened: true)
        }

        XCTAssertEqual(cost.viewsCreated, 1)
        XCTAssertEqual(cost.recordsApplied, 2)
    }

    func testToStayWithinNamesEveryCounterOverBudget() throws {
        try feed()

        let cost = try costOf { try renderer.setProperty(id: 60, name: "text", value: .text("Renamed")) }

        XCTExpectFailure("measureCalls and nodesFramed are over a budget of 0") {
            cost.toStayWithin(["measureCalls": 0, "nodesFramed": 0, "viewsCreated": 0])
        } issueMatcher: { issue in
            issue.compactDescription.contains("measureCalls") && issue.compactDescription.contains("nodesFramed")
        }
    }

    // MARK: - Budgets (kuito-frame-drops-novel-plan.md, D3)

    func testS1APaintOnlyTapCreatesNoViewAndRedrawsAtMostOneLabel() throws {
        try feed()

        let cost = try costOf { try renderer.setProperty(id: 1, name: "backgroundColor", value: .color(0xe50914ff)) }

        cost.toStayWithin(["labelRedraws": 1, "viewsCreated": 0, "measureCalls": 0])
    }

    /// A paint-only write marks no layout (docs/native-renderer.md#prop-effects).
    func testS1APaintOnlyTapLaysNothingOut() throws {
        try feed()

        let cost = try costOf { try renderer.setProperty(id: 1, name: "backgroundColor", value: .color(0xe50914ff)) }

        cost.toStayWithin(["layoutPasses": 0, "nodesFramed": 0])
    }

    /// Target F2 (layout delta journal) and F3 (measure-ahead).
    func testOneLabelsTextAmongAHundredMeasuresOnceAndFramesTwoNodes() throws {
        try feed()

        let cost = try costOf { try renderer.setProperty(id: 60, name: "text", value: .text("Renamed")) }

        XCTExpectFailure("target F2, F3: one measure, the label and its parent framed; every view is framed today") {
            cost.toStayWithin(["measureCalls": 1, "nodesFramed": 2, "labelRedraws": 1])
        }
    }

    func testS6AnIdleFrameCostsNothing() throws {
        try feed()

        let cost = costOf {}

        cost.toStayWithin(Dictionary(uniqueKeysWithValues: cost.counts.map { ($0.name, 0) }))
    }

    // MARK: - Support

    /// What `interaction` cost once its layout and drawing ran, as a frame runs them.
    private func costOf(_ interaction: () throws -> Void) rethrows -> KuitoCost {
        let before = KuitoCost.total

        try interaction()
        settle()

        let cost = KuitoCost.between(before, KuitoCost.total)

        print("KuitoCost \(name): \(cost.counts.map { "\($0.name)=\($0.count)" }.joined(separator: " "))")

        return cost
    }

    /// Lays out and draws what is pending, as the next frame's commit does.
    private func settle() {
        container.layoutIfNeeded()

        func display(_ layer: CALayer) {
            layer.displayIfNeeded()
            layer.sublayers?.forEach(display)
        }

        display(container.layer)
    }
}
