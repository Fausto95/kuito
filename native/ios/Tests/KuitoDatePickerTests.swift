import UIKit
import XCTest

/// DatePicker (native/modules/date-picker): a compact UIDatePicker whose
/// value, bounds and type arrive as the module view's props, and whose
/// `change` carries the moment the user picked, in milliseconds.
@MainActor
final class KuitoDatePickerTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1
    private var sent: [String] = []
    /// 21 October 2026, 14:30 UTC.
    private let moment = 1_792_593_000_000.0
    private let day = 86_400_000.0

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:DatePicker",
            KuitoModuleView(KuitoDatePickerView.self, KuitoDatePickerView.define).kind(events: ["change"])
        )
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: id, kind: "module:DatePicker", parent: 0, label: "due")
    }

    private var picker: KuitoDatePickerView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoDatePickerView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    func testItIsTheCompactPickerOfADate() throws {
        XCTAssertEqual(try picker.preferredDatePickerStyle, .compact)
        XCTAssertEqual(try picker.datePickerMode, .date)
    }

    func testTypePicksTheMode() throws {
        try set("type", .text("time"))
        XCTAssertEqual(try picker.datePickerMode, .time)

        try set("type", .text("datetime"))
        XCTAssertEqual(try picker.datePickerMode, .dateAndTime)

        try set("type", .null)
        XCTAssertEqual(try picker.datePickerMode, .date)
    }

    func testValueAndBoundsAreMilliseconds() throws {
        try set("value", .number(moment))
        try set("min", .number(moment - 86_400_000))
        try set("max", .number(moment + 86_400_000))

        XCTAssertEqual(try picker.date, Date(timeIntervalSince1970: moment / 1000))
        XCTAssertEqual(try picker.minimumDate, Date(timeIntervalSince1970: (moment - 86_400_000) / 1000))
        XCTAssertEqual(try picker.maximumDate, Date(timeIntervalSince1970: (moment + 86_400_000) / 1000))

        try set("min", .null)
        XCTAssertNil(try picker.minimumDate)
    }

    func testTheAppsValueSendsNoChange() throws {
        try set("value", .number(moment))

        XCTAssertEqual(sent, [])
    }

    func testTheUsersPickSendsItsMoment() throws {
        try set("value", .number(moment))
        try pick(Date(timeIntervalSince1970: (moment + day) / 1000))

        XCTAssertEqual(sent, [#"change {"value":1792679400000}"#])
    }

    func testAPickKeepsWhatTheTypeHides() throws {
        try set("value", .number(moment))
        try pick(Date(timeIntervalSince1970: (moment + day + 3_600_000) / 1000))

        try set("type", .text("time"))
        try pick(Date(timeIntervalSince1970: (moment - 2 * day + 7_200_000) / 1000))

        XCTAssertEqual(sent, [
            #"change {"value":1792679400000}"#,
            #"change {"value":1792686600000}"#,
        ], "a day keeps 14:30, then 16:30 keeps the day")
    }

    func testAPickStaysWithinTheBounds() throws {
        try set("value", .number(moment))
        try set("min", .number(moment + day + 3_600_000))
        try pick(Date(timeIntervalSince1970: (moment + day + 3_600_000) / 1000))

        XCTAssertEqual(sent, [#"change {"value":1792683000000}"#], "the next day at 14:30 is before the min, 15:30")
    }

    /// The user picks `date`: UIKit sets it and sends valueChanged.
    private func pick(_ date: Date) throws {
        let picker = try picker

        picker.date = date
        picker.sendActions(for: .valueChanged)
    }

    func testDisabledTakesNoTouch() throws {
        try set("disabled", .bool(true))
        XCTAssertFalse(try picker.isEnabled)

        try set("disabled", .null)
        XCTAssertTrue(try picker.isEnabled)
    }

    func testAnUnknownTypeOrAValueThatIsNoMomentIsRejected() {
        for (name, value) in [("type", KuitoValue.text("week")), ("value", .text("tomorrow")), ("min", .bool(true))] {
            XCTAssertThrowsError(try set(name, value), name) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, name)
            }
        }
    }
}
