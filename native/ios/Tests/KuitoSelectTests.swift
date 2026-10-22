import UIKit
import XCTest

/// Select (native/modules/select): a button that shows the chosen option's
/// label and lists the options in its menu, the chosen one checked. Its
/// `change` carries the value of the option the user picked.
@MainActor
final class KuitoSelectTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1
    private var sent: [String] = []
    private let sizes = #"[{"value":"s","label":"Small"},{"value":"m","label":"Medium"},{"value":"l","label":"Large"}]"#

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:Select",
            KuitoModuleView(KuitoSelectView.self, KuitoSelectView.define).kind(events: ["change"])
        )
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: id, kind: "module:Select", parent: 0, label: "size")
        try set("options", .json(sizes))
    }

    private var select: KuitoSelectView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoSelectView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    /// The menu's actions, as `title state`.
    private func menu() throws -> [String] {
        try XCTUnwrap(select.menu).children.compactMap { $0 as? UIAction }.map { "\($0.title) \($0.state == .on ? "on" : "off")" }
    }

    func testItShowsTheChosenOptionAndChecksItInItsMenu() throws {
        try set("value", .text("m"))

        XCTAssertEqual(try select.configuration?.title, "Medium")
        XCTAssertEqual(try menu(), ["Small off", "Medium on", "Large off"])
        XCTAssertTrue(try select.showsMenuAsPrimaryAction, "a tap opens the menu")
    }

    func testWithNoOptionChosenItShowsThePlaceholder() throws {
        try set("placeholder", .text("Size"))
        XCTAssertEqual(try select.configuration?.title, "Size")

        try set("value", .text("xl"))
        XCTAssertEqual(try select.configuration?.title, "Size", "no option has the value")
        XCTAssertEqual(try menu(), ["Small off", "Medium off", "Large off"])
    }

    func testTheAppsValueSendsNoChange() throws {
        try set("value", .text("l"))

        XCTAssertEqual(sent, [])
    }

    func testTheUsersPickSendsItsValueAndShowsIt() throws {
        try set("value", .text("s"))
        try select.picked("l")

        XCTAssertEqual(sent, [#"change {"value":"l"}"#])
        XCTAssertEqual(try select.configuration?.title, "Large")
        XCTAssertEqual(try menu(), ["Small off", "Medium off", "Large on"])
    }

    func testDisabledTakesNoTouch() throws {
        try set("value", .text("m"))
        try set("disabled", .bool(true))
        XCTAssertFalse(try select.isEnabled)
        XCTAssertEqual(try select.configuration?.baseForegroundColor, .tertiaryLabel, "dimmed, as UIKit's own controls")

        try set("disabled", .null)
        XCTAssertTrue(try select.isEnabled)
    }

    func testOptionsThatRepeatAValueOrLackALabelAreRejected() {
        for value in [#"[{"value":"s","label":"Small"},{"value":"s","label":"Short"}]"#, #"[{"value":"s"}]"#, #""s""#] {
            XCTAssertThrowsError(try set("options", .json(value)), value) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "options")
            }
        }
    }
}
