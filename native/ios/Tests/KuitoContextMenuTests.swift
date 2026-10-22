import UIKit
import XCTest

/// ContextMenu (native/modules/context-menu): a view around its children
/// whose long press opens a menu of its items. Its `select` carries the
/// value of the item the user picked.
@MainActor
final class KuitoContextMenuTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1
    private var sent: [String] = []
    private let items = #"[{"value":"share","label":"Share"},{"value":"played","label":"Mark played","disabled":true},{"value":"delete","label":"Delete","destructive":true}]"#

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:ContextMenu",
            KuitoModuleView(KuitoContextMenuView.self, KuitoContextMenuView.define).kind(events: ["select"])
        )
        renderer = KuitoUIKitRenderer(container: container)
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: id, kind: "module:ContextMenu", parent: 0, label: "menu")
        try set("items", .json(items))
    }

    private var menu: KuitoContextMenuView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoContextMenuView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    /// The menu's items, as `title attributes`.
    private func shown() throws -> [String] {
        try XCTUnwrap(menu.items()).children.compactMap { $0 as? UIAction }.map { action in
            let attributes = [(UIMenuElement.Attributes.destructive, "destructive"), (.disabled, "disabled")]
                .filter { action.attributes.contains($0.0) }
                .map(\.1)

            return ([action.title] + attributes).joined(separator: " ")
        }
    }

    private func configuration() throws -> UIContextMenuConfiguration? {
        let menu = try menu
        let interaction = try XCTUnwrap(menu.interactions.compactMap { $0 as? UIContextMenuInteraction }.first)

        return menu.contextMenuInteraction(interaction, configurationForMenuAtLocation: .zero)
    }

    func testALongPressOpensAMenuOfItsItems() throws {
        XCTAssertNotNil(try configuration())
        XCTAssertEqual(try shown(), ["Share", "Mark played disabled", "Delete destructive"])
    }

    func testTheTitleHeadsTheMenu() throws {
        try set("title", .text("Episode 4"))
        XCTAssertEqual(try XCTUnwrap(menu.items()).title, "Episode 4")

        try set("title", .null)
        XCTAssertEqual(try XCTUnwrap(menu.items()).title, "")
    }

    func testTheUsersPickSendsItsValue() throws {
        try menu.picked("delete")

        XCTAssertEqual(sent, [#"select {"value":"delete"}"#])
    }

    func testDisabledOrWithoutItemsItOpensNoMenu() throws {
        try set("disabled", .bool(true))
        XCTAssertNil(try configuration())

        try set("disabled", .null)
        try set("items", .json("[]"))
        XCTAssertNil(try configuration())
    }

    func testItLaysOutItsChildrenInsideIt() throws {
        try renderer.createView(id: 2, kind: "Text", parent: id, label: "title")
        try renderer.setProperty(id: 2, name: "text", value: .text("Episode 4"))
        container.layoutIfNeeded()

        let title = try XCTUnwrap(renderer.nodes[2]?.view)

        XCTAssertTrue(title.superview === (try menu))
        XCTAssertGreaterThan(try menu.frame.height, 0, "it is as tall as its children")
        XCTAssertEqual(try menu.frame.height, title.frame.height)
    }

    func testItemsThatRepeatAValueOrLackALabelAreRejected() {
        for value in [#"[{"value":"a","label":"A"},{"value":"a","label":"B"}]"#, #"[{"value":"a"}]"#, #""a""#] {
            XCTAssertThrowsError(try set("items", .json(value)), value) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "items")
            }
        }
    }
}
