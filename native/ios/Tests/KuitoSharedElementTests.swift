import UIKit
import XCTest

/// Views with a sharedId, as a navigation stack asks for them on each screen
/// it transitions between (docs/navigation.md#shared-elements).
@MainActor
final class KuitoSharedElementTests: XCTestCase {
    private var container: UIView!
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: 1, kind: "Box", parent: 0, label: "poster")
        try renderer.createView(id: 2, kind: "VStack", parent: 0, label: "row")
        try renderer.createView(id: 3, kind: "Box", parent: 2, label: "title")
        try renderer.createView(id: 4, kind: "Box", parent: 2, label: "plain")
        try renderer.setProperty(id: 1, name: "sharedId", value: .text("poster-7"))
        try renderer.setProperty(id: 3, name: "sharedId", value: .text("title-7"))
    }

    func testFindsEachSharedViewInsideARoot() throws {
        let shared = renderer.sharedElements(in: container)

        XCTAssertEqual(Set(shared.keys), ["poster-7", "title-7"])
        XCTAssertEqual(shared["poster-7"].flatMap(renderer.id(containing:)), 1)
        XCTAssertEqual(shared["title-7"].flatMap(renderer.id(containing:)), 3)
    }

    func testAClearedSharedIdIsNoLongerShared() throws {
        try renderer.setProperty(id: 1, name: "sharedId", value: .null)

        XCTAssertEqual(Set(renderer.sharedElements(in: container).keys), ["title-7"])
    }

    func testOnlyViewsInsideTheRootAreShared() throws {
        let row = try XCTUnwrap(renderer.sharedElements(in: container)["title-7"]?.superview)

        XCTAssertEqual(Set(renderer.sharedElements(in: row).keys), ["title-7"])
    }
}
