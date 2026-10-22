import UIKit
import XCTest

/// SegmentedControl (native/modules/segmented-control): a UISegmentedControl
/// with a segment per option, the chosen one selected. Its `change` carries
/// the value of the segment the user picked.
@MainActor
final class KuitoSegmentedControlTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1
    private var sent: [String] = []
    private let views = #"[{"value":"day","label":"Day"},{"value":"week","label":"Week"},{"value":"month","label":"Month"}]"#

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:SegmentedControl",
            KuitoModuleView(KuitoSegmentedControlView.self, KuitoSegmentedControlView.define).kind(events: ["change"])
        )
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: id, kind: "module:SegmentedControl", parent: 0, label: "view")
        try set("options", .json(views))
    }

    private var control: KuitoSegmentedControlView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoSegmentedControlView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    private func titles() throws -> [String?] {
        let control = try control

        return (0..<control.numberOfSegments).map { control.titleForSegment(at: $0) }
    }

    func testASegmentPerOptionTheChosenOneSelected() throws {
        try set("value", .text("week"))

        XCTAssertEqual(try titles(), ["Day", "Week", "Month"])
        XCTAssertEqual(try control.selectedSegmentIndex, 1)
    }

    func testAValueThatNamesNoOptionSelectsNone() throws {
        try set("value", .text("year"))
        XCTAssertEqual(try control.selectedSegmentIndex, UISegmentedControl.noSegment)

        try set("value", .text("day"))
        try set("value", .null)
        XCTAssertEqual(try control.selectedSegmentIndex, UISegmentedControl.noSegment)
    }

    func testNewOptionsKeepTheChosenValue() throws {
        try set("value", .text("week"))
        try set("options", .json(#"[{"value":"week","label":"This week"},{"value":"day","label":"Today"}]"#))

        XCTAssertEqual(try titles(), ["This week", "Today"])
        XCTAssertEqual(try control.selectedSegmentIndex, 0)
    }

    func testTheAppsValueSendsNoChange() throws {
        try set("value", .text("month"))

        XCTAssertEqual(sent, [])
    }

    func testTheUsersPickSendsItsValue() throws {
        let control = try control

        control.selectedSegmentIndex = 2
        control.sendActions(for: .valueChanged)

        XCTAssertEqual(sent, [#"change {"value":"month"}"#])
    }

    func testDisabledTakesNoTouch() throws {
        try set("disabled", .bool(true))
        XCTAssertFalse(try control.isEnabled)

        try set("disabled", .null)
        XCTAssertTrue(try control.isEnabled)
    }

    func testOptionsThatRepeatAValueOrLackALabelAreRejected() {
        for value in [#"[{"value":"day","label":"Day"},{"value":"day","label":"Today"}]"#, #"[{"value":"day"}]"#, #""day""#] {
            XCTAssertThrowsError(try set("options", .json(value)), value) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "options")
            }
        }
    }
}
