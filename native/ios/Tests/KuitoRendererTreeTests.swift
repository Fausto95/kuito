import UIKit
import XCTest

/// A mutation the tree cannot take is an error naming the view, never a
/// view placed somewhere else or dropped (CLAUDE.md, Errors).
@MainActor
final class KuitoRendererTreeTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let box: UInt32 = 1

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        try renderer.createView(id: box, kind: "Box", parent: 0, label: "box")
    }

    func testANumberInUseIsAnInvalidTree() {
        assertInvalidTree(try renderer.createView(id: box, kind: "Text", parent: 0, label: "again"))
    }

    func testAnUnknownKindIsAnInvalidTree() {
        assertInvalidTree(try renderer.createView(id: 2, kind: "Bogus", parent: box, label: "bogus"))
    }

    func testANavigationScreenOutsideAStackIsAnInvalidTree() {
        assertInvalidTree(try renderer.createView(id: 2, kind: "NavigationScreen", parent: box, label: "screen"))
    }

    func testAViewInsideAStackThatIsNotAScreenIsAnInvalidTree() throws {
        try renderer.createView(id: 2, kind: "NavigationStack", parent: box, label: "stack")

        assertInvalidTree(try renderer.createView(id: 3, kind: "Box", parent: 2, label: "loose"))
    }

    func testAnUnknownParentIsAMissingView() {
        assertMissingView(try renderer.createView(id: 2, kind: "Box", parent: 99, label: "orphan"))
    }

    func testEveryMutationOfAnUnknownViewIsAMissingView() {
        assertMissingView(try renderer.setProperty(id: 99, name: "opacity", value: .number(1)))
        assertMissingView(try renderer.moveView(id: 99, parent: box, index: 0))
        assertMissingView(try renderer.removeView(id: 99))
        assertMissingView(try renderer.setFlattened(id: 99, flattened: true))
        assertMissingView(try renderer.command(id: 99, name: "focus", argument: ""))
    }

    // MARK: - One record per view

    func testAViewsRecordHoldsItsView() throws {
        let record = try XCTUnwrap(renderer.nodes[box])

        XCTAssertNotNil(record.view?.superview)
        XCTAssertTrue(record.view === record.layout.view)
    }

    func testFlatteningChangesOnlyTheRecordsView() throws {
        try renderer.createView(id: 2, kind: "Text", parent: box, label: "label")

        let record = try XCTUnwrap(renderer.nodes[box])
        let label = try XCTUnwrap(renderer.nodes[2]?.view)

        try renderer.setFlattened(id: box, flattened: true)

        XCTAssertTrue(renderer.nodes[box] === record, "the record stays")
        XCTAssertNil(record.view)
        XCTAssertNotNil(label.superview, "its child keeps its view")

        try renderer.setFlattened(id: box, flattened: false)

        XCTAssertTrue(label.superview === record.view)
    }

    func testAScrollViewsRecordHoldsItsContent() throws {
        try renderer.createView(id: 2, kind: "Scroll", parent: box, label: "scroll")
        try renderer.createView(id: 3, kind: "Text", parent: 2, label: "label")

        let scroll = try XCTUnwrap(renderer.nodes[2])
        let content = try XCTUnwrap(scroll.content)

        XCTAssertFalse(content === scroll.view)
        XCTAssertTrue(renderer.nodes[3]?.view?.superview === content)
    }

    func testASheetsRecordIsALayoutRoot() throws {
        try renderer.createView(id: 2, kind: "Sheet", parent: box, label: "sheet")

        let sheet = try XCTUnwrap(renderer.nodes[2])

        XCTAssertNotNil(sheet.sheet)
        XCTAssertTrue(sheet.layoutRoot === sheet.view)
    }

    func testClearingDropsEveryRecord() throws {
        try renderer.createView(id: 2, kind: "Text", parent: box, label: "label")

        renderer.clear()

        XCTAssertTrue(renderer.nodes.isEmpty)
    }

    // MARK: - Picking a view under a point

    /// The devtools' Select on device picks the deepest view the renderer drew, through any view UIKit
    /// adds on top of them: on iOS 26, a navigation stack's floating bar container covers its screens.
    func testAPointPicksTheDeepestDrawnViewThroughViewsUIKitAdded() throws {
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let renderer = KuitoUIKitRenderer(container: container)

        try renderer.createView(id: 1, kind: "Box", parent: 0, label: "screen")
        try renderer.setProperty(id: 1, name: "width", value: .number(320))
        try renderer.setProperty(id: 1, name: "height", value: .number(640))
        try renderer.createView(id: 2, kind: "Box", parent: 1, label: "poster")
        try renderer.setProperty(id: 2, name: "width", value: .number(100))
        try renderer.setProperty(id: 2, name: "height", value: .number(100))
        container.layoutIfNeeded()

        let added = UIView(frame: container.bounds)
        try XCTUnwrap(renderer.nodes[1]?.view).addSubview(added)

        XCTAssertEqual(renderer.id(at: CGPoint(x: 50, y: 50)), 2)
        XCTAssertEqual(renderer.id(at: CGPoint(x: 200, y: 300)), 1)
        XCTAssertNil(renderer.id(at: CGPoint(x: 400, y: 50)), "outside every view")
    }

    func testContainersAreHostsAndViewsThatNeedTheirRecordAreStyled() throws {
        for (id, kind) in zip(UInt32(2)..., ["List", "HorizontalList", "NavigationStack", "NavigationTabs", "Pressable", "SafeArea", "Sheet"]) {
            try renderer.createView(id: id, kind: kind, parent: box, label: kind)
        }

        let hosts = renderer.nodes.filter { $0.value.host != nil }.map(\.value.kind)

        XCTAssertEqual(Set(hosts), ["List", "HorizontalList", "NavigationStack", "NavigationTabs"])
        XCTAssertTrue((renderer.nodes[6]?.view as? KuitoPressableView)?.style === renderer.nodes[6])
        XCTAssertTrue((renderer.nodes[7]?.view as? KuitoSafeAreaView)?.style === renderer.nodes[7])
        XCTAssertNotNil(renderer.nodes[8]?.sheet)
    }

    /// A native module's container is a host like the built-in ones: the
    /// renderer hands it its children and asks nothing of its type.
    func testAModuleContainerHostsItsChildren() throws {
        KuitoModuleViews.shared.register("module:TestHost", KuitoModuleViewKind(
            make: { _, _ in KuitoCreatedView(view: RecordingHost()) }, props: [:]
        ))
        try renderer.createView(id: 2, kind: "module:TestHost", parent: box, label: "host")

        let host = try XCTUnwrap(renderer.nodes[2]?.view as? RecordingHost)

        try renderer.createView(id: 3, kind: "Box", parent: 2, label: "a")
        try renderer.createView(id: 4, kind: "Box", parent: 2, label: "b")
        try renderer.moveView(id: 4, parent: 2, index: 0)
        try renderer.removeView(id: 3)

        XCTAssertEqual(host.calls, ["adopt a", "adopt b", "move b 0", "release a"])
        XCTAssertNil(renderer.nodes[3], "released at once: gone without a transition")
        assertInvalidTree(try renderer.moveView(id: 4, parent: box, index: 0))
    }

    private func assertInvalidTree(_ mutation: @autoclosure () throws -> Void, line: UInt = #line) {
        XCTAssertThrowsError(try mutation(), line: line) { error in
            guard case KuitoRenderError.invalidTree = error else {
                return XCTFail("threw \(error), not invalidTree", line: line)
            }
        }
    }

    private func assertMissingView(_ mutation: @autoclosure () throws -> Void, line: UInt = #line) {
        XCTAssertThrowsError(try mutation(), line: line) { error in
            guard case KuitoRenderError.missingView = error else {
                return XCTFail("threw \(error), not missingView", line: line)
            }
        }
    }
}

/// A module container that records what the renderer asks of it.
@MainActor
private final class RecordingHost: UIView, KuitoHost {
    var calls: [String] = []
    private var labels: [ObjectIdentifier: String] = [:]

    func adopt(_ child: UIView, label: String, at _: Int?) throws {
        labels[ObjectIdentifier(child)] = label
        calls.append("adopt \(label)")
    }

    func move(_ child: UIView, to index: Int) throws {
        calls.append("move \(labels[ObjectIdentifier(child)] ?? "?") \(index)")
    }

    func release(_ child: UIView, gone: @escaping () -> Void) throws {
        calls.append("release \(labels[ObjectIdentifier(child)] ?? "?")")
        gone()
    }

    func animatesRemoval(_: UIView) -> Bool {
        false
    }
}
