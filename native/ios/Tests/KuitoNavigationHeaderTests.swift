import UIKit
import XCTest

/// A screen's header slot (docs/navigation.md#headers): its items become the
/// navigation item's bar buttons, leading and trailing, its large title the
/// item's display mode, and its search a search controller; each reports
/// back as an event of the screen.
@MainActor
final class KuitoNavigationHeaderTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    private var renderer: KuitoUIKitRenderer!
    private var sent: [String] = []
    private let stack: UInt32 = 1
    private let screen: UInt32 = 2

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        renderer.onEvent = { [unowned self] id, event, payload in
            sent.append("\(id).\(describeEvent(event, payload))")

            return false
        }
        try renderer.createView(id: stack, kind: "NavigationStack", parent: 0, label: "stack")
        try renderer.createView(id: screen, kind: "NavigationScreen", parent: stack, label: "screen")
        try renderer.setProperty(id: screen, name: "title", value: .text("Shows"))
    }

    private func item() throws -> UINavigationItem {
        let view = try XCTUnwrap(renderer.nodes[screen]?.view as? KuitoNavigationScreenView)

        return try XCTUnwrap(view.controller?.navigationItem, "the stack made the screen's controller")
    }

    private func setItems(_ items: [Structured.HeaderItem]) throws {
        try renderer.setProperty(id: screen, name: "headerItems", value: Structured.headerItems(items))
    }

    func testItemsBecomeBarButtonsOnTheirSide() throws {
        try setItems([
            .init(label: "Edit", leading: true),
            .init(label: "Add", icon: .platforms(ios: "plus", android: "add")),
            .init(label: "Share", icon: .symbol("square.and.arrow.up"), disabled: true),
        ])

        let item = try item()
        let leading = try XCTUnwrap(item.leftBarButtonItems)
        let trailing = try XCTUnwrap(item.rightBarButtonItems)

        XCTAssertEqual(leading.map(\.title), ["Edit"])
        XCTAssertTrue(item.leftItemsSupplementBackButton, "the back button stays")
        // UIKit lays out right bar items from the trailing edge in: the first is outermost.
        XCTAssertEqual(trailing.map(\.accessibilityLabel), ["Add", "Share"])
        XCTAssertEqual(trailing.map(\.image), [UIImage(systemName: "plus"), UIImage(systemName: "square.and.arrow.up")])
        XCTAssertEqual(trailing.map(\.isEnabled), [true, false])
    }

    func testPressingAnItemReportsItsIndexAmongAllItems() throws {
        try setItems([.init(label: "Edit", leading: true), .init(label: "Add")])

        let add = try XCTUnwrap(item().rightBarButtonItems?.first)

        let action = try XCTUnwrap(add.action)

        XCTAssertTrue(UIApplication.shared.sendAction(action, to: add.target, from: add, for: nil))

        XCTAssertEqual(sent, ["\(screen).\(describeEvent("headeritem", KuitoIndexPayload(index: 1)))"])
    }

    func testNoItemsClearsTheBar() throws {
        try setItems([.init(label: "Add")])
        try renderer.setProperty(id: screen, name: "headerItems", value: .null)

        XCTAssertEqual(try item().rightBarButtonItems ?? [], [])
    }

    // A placement or a label C++ checks against the schema; the symbol only the platform knows.
    func testAnUnknownSymbolIsRejected() throws {
        XCTAssertThrowsError(try setItems([.init(label: "Add", icon: .symbol("no.such.symbol"))]))
    }

    func testALargeTitleIsAsked() throws {
        XCTAssertEqual(try item().largeTitleDisplayMode, .never, "a small title by default")

        try renderer.setProperty(id: screen, name: "largeTitle", value: .bool(true))

        XCTAssertEqual(try item().largeTitleDisplayMode, .always)
    }

    func testSearchIsASearchControllerThatReportsItsText() throws {
        try renderer.setProperty(id: screen, name: "search", value: Structured.search(placeholder: "Shows"))

        let search = try XCTUnwrap(item().searchController)

        XCTAssertEqual(search.searchBar.placeholder, "Shows")
        XCTAssertFalse(try item().hidesSearchBarWhenScrolling, "shown without a scroll to reveal it")

        search.searchBar.text = "bear"
        search.searchResultsUpdater?.updateSearchResults(for: search)
        search.searchBar.delegate?.searchBarSearchButtonClicked?(search.searchBar)

        XCTAssertEqual(sent, [
            "\(screen).\(describeEvent("search", KuitoTextPayload(text: "bear")))",
            "\(screen).\(describeEvent("searchsubmit", KuitoTextPayload(text: "bear")))",
        ])

        try renderer.setProperty(id: screen, name: "search", value: .null)

        XCTAssertNil(try item().searchController)
    }
}
