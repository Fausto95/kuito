import UIKit
import XCTest

/// A view with `exit` leaves Kuito's tree when removed but stays on screen,
/// taking the props the UI thread animates it out with, until it says `exited`.
@MainActor
final class KuitoRendererExitTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private let box: UInt32 = 1
    private let card: UInt32 = 2

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: box, kind: "Box", parent: 0, label: "box")
        try renderer.createView(id: card, kind: "Box", parent: box, label: "card")
    }

    func testAViewWithoutExitGoesAtOnce() throws {
        let view = try XCTUnwrap(renderer.nodes[card]?.layout.view)

        try renderer.removeView(id: card)

        XCTAssertNil(view.superview)
    }

    func testAnExitingViewStaysUntilExited() throws {
        let view = try XCTUnwrap(renderer.nodes[card]?.layout.view)

        try renderer.setProperty(id: card, name: "exit", value: .bool(true))
        try renderer.removeView(id: card)

        XCTAssertNotNil(view.superview, "it stays on screen")
        XCTAssertFalse(view.isUserInteractionEnabled, "but takes no touches")

        try renderer.setDrivenProperty(id: card, name: "opacity", value: .number(0.5))
        XCTAssertEqual(view.alpha, 0.5, accuracy: 0.001, "the UI thread animates it out")

        XCTAssertNotNil(renderer.nodes[card]?.exiting, "its record says it is leaving")
        XCTAssertThrowsError(try renderer.moveView(id: card, parent: box, index: 0), "it is out of the tree") { error in
            guard case KuitoRenderError.missingView = error else { return XCTFail("threw \(error), not missingView") }
        }

        try renderer.setDrivenProperty(id: card, name: "exited", value: .bool(true))
        XCTAssertNil(view.superview, "then it goes")
        XCTAssertNil(renderer.nodes[card], "with its record")
        XCTAssertThrowsError(try renderer.setDrivenProperty(id: card, name: "opacity", value: .number(0)))
    }

    func testClearingDropsAnExitingView() throws {
        let view = try XCTUnwrap(renderer.nodes[card]?.layout.view)

        try renderer.setProperty(id: card, name: "exit", value: .bool(true))
        try renderer.removeView(id: card)
        renderer.clear()

        XCTAssertNil(view.superview)
    }
}
