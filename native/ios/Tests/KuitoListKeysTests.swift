import UIKit
import XCTest

/// A list's keys arrive as edits to the keys it has, applied in order
/// (docs/lists.md#keys); sticky rows follow their keys to their new places.
@MainActor
final class KuitoListKeysTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 400))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
    }

    func testEditsApplyInOrderToTheKeysTheListHas() throws {
        let list = try makeList()

        try keys(inserting: ["a", "b", "c", "d"])
        try keys([KuitoKeyEdit(.remove, "b", at: 1), KuitoKeyEdit(.move, "d", at: 0), KuitoKeyEdit(.insert, "e", at: 2)])

        XCTAssertEqual(list.layout.keys, ["d", "a", "e", "c"])
        XCTAssertEqual(list.layout.indexOfKey, ["d": 0, "a": 1, "e": 2, "c": 3])
        XCTAssertEqual(list.collection.numberOfItems(inSection: 0), 4)
    }

    func testAStickyRowPinsAtItsNewPlaceWhenRowsComeAndGoAboveIt() throws {
        let list = try makeList()

        try keys(inserting: (0..<12).map { "k\($0)" })
        try renderer.setProperty(id: 1, name: "stickyKeys", value: Structured.keys(["k3"]))
        try keys([KuitoKeyEdit(.insert, "n0", at: 0), KuitoKeyEdit(.insert, "n1", at: 1)])

        for key in list.layout.keys { list.layout.setSize(CGSize(width: 320, height: 100), of: key) }

        XCTAssertEqual(try pinnedY(of: 5, in: list, offset: 620), 620, "k3 is row 5 now")

        try keys([KuitoKeyEdit(.remove, "n0", at: 0), KuitoKeyEdit(.remove, "n1", at: 0)])

        XCTAssertEqual(try pinnedY(of: 3, in: list, offset: 320), 320, "k3 is row 3 again")
    }

    func testAnEditThatDoesNotFitTheKeysIsRejectedAndChangesNothing() throws {
        let list = try makeList()

        try keys(inserting: ["a"])

        assertRejected([KuitoKeyEdit(.insert, "b", at: 1), KuitoKeyEdit(.remove, "x", at: 0)])
        assertRejected([KuitoKeyEdit(.remove, "a", at: 1)])
        assertRejected([KuitoKeyEdit(.move, "x", at: 0)])
        assertRejected([KuitoKeyEdit(.move, "a", at: 1)])
        assertRejected([KuitoKeyEdit(.insert, "b", at: 2)])

        XCTAssertEqual(list.layout.keys, ["a"])
        XCTAssertEqual(list.collection.numberOfItems(inSection: 0), 1)
    }

    func testADuplicateKeyIsAnUnsupportedValue() throws {
        try makeList()
        try keys(inserting: ["a"])

        assertRejected([KuitoKeyEdit(.insert, "a", at: 1)], reason: "unique")
    }

    func testNullClearsTheKeys() throws {
        let list = try makeList()

        try keys(inserting: ["a", "b"])
        try renderer.setProperty(id: 1, name: "keys", value: .null)

        XCTAssertEqual(list.layout.keys, [])
        XCTAssertEqual(list.collection.numberOfItems(inSection: 0), 0)
    }

    func testAListGivenMotionSendsItsOffsetAsItScrolls() throws {
        let list = try makeList()
        var sent: [[Double]] = []

        try keys(inserting: (0..<60).map { "row-\($0)" })
        list.layoutIfNeeded()
        renderer.onEvent = { id, event, record in
            if id == 1, event == "motion" { sent.append(record.numbers) }

            return false
        }
        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(true))
        list.motion.frame()
        list.collection.contentOffset = CGPoint(x: 0, y: 90)

        XCTAssertEqual(sent.first, [0, 0, 0], "where it is, at rest")
        XCTAssertEqual(sent.last?.first, 90)
    }

    @discardableResult
    private func makeList() throws -> KuitoListView {
        try renderer.createView(id: 1, kind: "List", parent: 0, label: "list")
        try renderer.setProperty(id: 1, name: "width", value: .number(320))
        try renderer.setProperty(id: 1, name: "height", value: .number(400))
        container.layoutIfNeeded()

        let list = try XCTUnwrap(firstList(in: container))

        list.layoutIfNeeded()

        return list
    }

    private func keys(_ edits: [KuitoKeyEdit]) throws {
        try renderer.setProperty(id: 1, name: "keys", value: .keys(edits))
    }

    /// The first keys of a list: each inserted at the end.
    private func keys(inserting keys: [String]) throws {
        try self.keys(keys.enumerated().map { KuitoKeyEdit(.insert, $1, at: $0) })
    }

    private func assertRejected(_ edits: [KuitoKeyEdit], reason expected: String? = nil, line: UInt = #line) {
        XCTAssertThrowsError(try keys(edits), "\(edits)", line: line) { error in
            guard case KuitoRenderError.unsupportedValue("keys", _, _, let reason) = error else {
                return XCTFail("\(edits) threw \(error), not unsupportedValue", line: line)
            }

            if let expected { XCTAssertTrue(reason.contains(expected), reason, line: line) }
        }
    }

    private func pinnedY(of index: Int, in list: KuitoListView, offset: CGFloat) throws -> CGFloat {
        list.collection.contentOffset = CGPoint(x: 0, y: offset)

        let visible = CGRect(x: 0, y: offset, width: 320, height: 400)
        let found = try XCTUnwrap(list.layout.layoutAttributesForElements(in: visible)?.first { $0.indexPath.item == index })

        XCTAssertGreaterThan(found.zIndex, 0, "a sticky row draws over the rows under it")

        return found.frame.minY
    }

    private func firstList(in view: UIView) -> KuitoListView? {
        (view as? KuitoListView) ?? view.subviews.lazy.compactMap(firstList).first
    }
}
