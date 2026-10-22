import UIKit
import XCTest

/// A prop lays a measured leaf out again only when it can change the leaf's
/// size: a paint-only change must not re-measure the text.
@MainActor
final class KuitoRendererLayoutTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: 1, kind: "Text", parent: 0, label: "label")
        try renderer.setProperty(id: 1, name: "text", value: .text("Hello"))
        container.layoutIfNeeded()
    }

    private var label: KuitoLayoutNode {
        get throws { try XCTUnwrap(renderer.nodes[1]).layout }
    }

    /// An enum layout prop reaches the engine as its index among the manifest's
    /// values: the text beside it is not read.
    func testAnEnumLayoutPropLaysOutByItsIndex() throws {
        try renderer.createView(id: 2, kind: "VStack", parent: 0, label: "column")
        try renderer.createView(id: 3, kind: "Box", parent: 2, label: "box")
        try renderer.setProperty(id: 2, name: "height", value: .number(200))
        try renderer.setProperty(id: 3, name: "height", value: .number(20))
        // justifyContent: normal, start, end, flex-start, flex-end, ...
        try renderer.setProperty(id: 2, name: "justifyContent", value: .enumValue(4, ""))
        container.layoutIfNeeded()

        XCTAssertEqual(try XCTUnwrap(renderer.nodes[3]?.layout.view).frame.minY, 180)
    }

    func testALaidOutTextIsClean() throws {
        XCTAssertFalse(try label.dirty)
    }

    func testPaintPropsKeepTheLayout() throws {
        try renderer.setProperty(id: 1, name: "color", value: .color(0xff0000ff))
        try renderer.setProperty(id: 1, name: "opacity", value: .number(0.5))
        try renderer.setProperty(id: 1, name: "textAlign", value: .enumValue(1, "center"))

        XCTAssertFalse(try label.dirty)
    }

    func testTextPropsMeasureAgain() throws {
        try renderer.setProperty(id: 1, name: "text", value: .text("Hello again"))

        XCTAssertTrue(try label.dirty)
    }

    func testALabelTheUIThreadWritesIsLaidOutAgain() throws {
        // In a row, a label is as wide as its text.
        try renderer.createView(id: 2, kind: "HStack", parent: 0, label: "row")
        try renderer.createView(id: 3, kind: "Text", parent: 2, label: "spin")
        try renderer.setProperty(id: 3, name: "text", value: .text("Spin"))
        container.layoutIfNeeded()

        let view = try XCTUnwrap(renderer.nodes[3]?.layout.view)
        let width = view.frame.width

        try renderer.setDrivenProperty(id: 3, name: "text", value: .text("Stop (0 spins)"))
        container.layoutIfNeeded()

        XCTAssertGreaterThan(view.frame.width, width)
    }

    func testFontPropsMeasureAgain() throws {
        try renderer.setProperty(id: 1, name: "fontSize", value: .number(24))

        XCTAssertTrue(try label.dirty)
    }

    /// A label that only moves, because the content above it grew, keeps
    /// what it drew.
    func testALabelThatOnlyMovesIsNotDrawnAgain() throws {
        try renderer.createView(id: 2, kind: "VStack", parent: 0, label: "column")
        try renderer.createView(id: 3, kind: "Box", parent: 2, label: "above")
        try renderer.createView(id: 4, kind: "Text", parent: 2, label: "moved")
        try renderer.setProperty(id: 3, name: "height", value: .number(20))
        try renderer.setProperty(id: 4, name: "text", value: .text("Hello"))
        container.layoutIfNeeded()

        let moved = try XCTUnwrap(renderer.nodes[4]?.view)
        let size = moved.bounds.size
        let center = moved.center

        moved.layer.displayIfNeeded()
        try renderer.setProperty(id: 3, name: "height", value: .number(40))
        container.layoutIfNeeded()

        XCTAssertEqual(moved.center.y, center.y + 20, accuracy: 0.001)
        XCTAssertEqual(moved.bounds.size, size)
        XCTAssertFalse(moved.layer.needsDisplay())
    }

    /// Every pass assigns each field its padding: a field that only moves,
    /// because the content above it grew, keeps its layout.
    func testAFieldThatOnlyMovesIsNotLaidOutAgain() throws {
        for kind in ["TextField", "MultilineTextField"] {
            let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
            let renderer = KuitoUIKitRenderer(container: container)

            try renderer.createView(id: 1, kind: "VStack", parent: 0, label: "column")
            try renderer.createView(id: 2, kind: "Box", parent: 1, label: "above")
            try renderer.createView(id: 3, kind: kind, parent: 1, label: "moved")
            try renderer.setProperty(id: 2, name: "height", value: .number(20))
            try renderer.setProperty(id: 3, name: "padding", value: .number(8))
            container.layoutIfNeeded()

            let root = try XCTUnwrap(renderer.nodes[1]?.view?.superview)
            let moved = try XCTUnwrap(renderer.nodes[3]?.view)
            let center = moved.center

            try renderer.setProperty(id: 2, name: "height", value: .number(40))
            // The root's pass alone: UIKit would lay the field out right after
            // it and clear the flag this test reads.
            root.layoutSubviews()

            XCTAssertEqual(moved.center.y, center.y + 20, accuracy: 0.001, kind)
            XCTAssertFalse(moved.layer.needsLayout(), kind)
        }
    }
}

/// Text's min-content width, its widest word, is what a shrinking row asks
/// for several times a pass. The label's style keeps it until its text or
/// font changes.
@MainActor
final class KuitoMinContentTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        renderer.textScale.update(.large)
        try renderer.createView(id: 1, kind: "HStack", parent: 0, label: "row")
        try renderer.createView(id: 2, kind: "Text", parent: 1, label: "title")
        try renderer.createView(id: 3, kind: "Text", parent: 1, label: "detail")
        try renderer.setProperty(id: 2, name: "text", value: .text("A title long enough to shrink in its row"))
        try renderer.setProperty(id: 3, name: "text", value: .text("A detail that shrinks beside it"))
        container.layoutIfNeeded()
    }

    private func measurements(_ id: UInt32 = 2) throws -> Int {
        try XCTUnwrap(renderer.nodes[id]).minContent.measurements
    }

    /// What the engine gets when it asks the label for its min-content width.
    private func minContentWidth(_ id: UInt32 = 2) throws -> CGFloat {
        let measure = try XCTUnwrap(renderer.nodes[id]?.layout.measure)

        return measure(0, .minContent, 0, .undefined).width
    }

    func testAShrinkingRowMeasuresEachLabelsWidestWordOnce() throws {
        XCTAssertEqual(try measurements(2), 1)
        XCTAssertEqual(try measurements(3), 1)

        try renderer.setProperty(id: 3, name: "text", value: .text("Another detail that shrinks beside it"))
        container.layoutIfNeeded()

        XCTAssertEqual(try measurements(2), 1, "a sibling's new text lays the row out again")
        XCTAssertEqual(try measurements(3), 2)
    }

    func testAskingAgainReusesTheWidth() throws {
        let width = try minContentWidth()

        XCTAssertEqual(try minContentWidth(), width)
        XCTAssertEqual(try measurements(), 1)
    }

    /// Color and alignment change no glyph's width.
    func testPaintChangesKeepTheWidth() throws {
        let width = try minContentWidth()

        try renderer.setProperty(id: 2, name: "color", value: .color(0xff0000ff))
        try renderer.setProperty(id: 2, name: "textAlign", value: .enumValue(1, "center"))

        XCTAssertEqual(try minContentWidth(), width)
        XCTAssertEqual(try measurements(), 1)
    }

    func testTextAndFontChangesMeasureItAgain() throws {
        let changes: [(String, KuitoValue)] = [
            ("text", .text("Unbelievably wordy title")),
            ("fontSize", .number(24)),
            ("fontWeight", .enumValue(1, "bold")),
            ("letterSpacing", .number(2)),
        ]
        var width = try minContentWidth()

        for (index, (name, value)) in changes.enumerated() {
            try renderer.setProperty(id: 2, name: name, value: value)
            let changed = try minContentWidth()

            XCTAssertEqual(try measurements(), index + 2, name)
            XCTAssertNotEqual(changed, width, name)
            width = changed
        }
    }

    func testADynamicTypeChangeMeasuresItAgain() throws {
        let width = try minContentWidth()

        renderer.textScale.update(.accessibilityExtraExtraExtraLarge)

        XCTAssertGreaterThan(try minContentWidth(), width)
        XCTAssertEqual(try measurements(), 2)
    }

    func testAControlHasNoNarrowerForm() throws {
        try renderer.createView(id: 4, kind: "Button", parent: 1, label: "go")
        try renderer.setProperty(id: 4, name: "text", value: .text("Go somewhere"))

        let button = try XCTUnwrap(renderer.nodes[4]?.view)

        XCTAssertEqual(try minContentWidth(4), button.sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)).width)
    }

    /// One typesetter over the whole text measures each word as it measures alone.
    func testTheWidestWordIsAsWideAsThatWordAlone() {
        let font = UIFont.systemFont(ofSize: 17)
        let texts: [NSAttributedString] = [
            NSAttributedString(string: "Hello, wonderful world", attributes: [.font: font]),
            NSAttributedString(string: "Tracked out wide", attributes: [.font: font, .kern: 3]),
            NSAttributedString(string: "Heavy\nlines\tand tabs", attributes: [.font: UIFont.systemFont(ofSize: 22, weight: .black)]),
            NSAttributedString(string: "東京都の今日の天気は晴れです", attributes: [.font: font]),
            NSAttributedString(string: "مرحبا بالعالم الجميل", attributes: [.font: font]),
            NSAttributedString(string: "Read שלום עולם aloud", attributes: [.font: font]),
        ]

        for text in texts {
            var widest: CGFloat = 0

            (text.string as NSString).enumerateSubstrings(in: NSRange(location: 0, length: text.length), options: .byWords) { _, range, _, _ in
                widest = max(widest, ceil(text.attributedSubstring(from: range).size().width))
            }

            XCTAssertEqual(KuitoMinContent.widestWord(text), widest, text.string)
        }
    }

    func testTextWithoutWordsHasNoWidestWord() {
        XCTAssertNil(KuitoMinContent.widestWord(NSAttributedString(string: "")))
        XCTAssertNil(KuitoMinContent.widestWord(NSAttributedString(string: " … ")))
    }
}

/// A stylesheet's `gap` reaches a list as `rowGap` and `columnGap`, an inline
/// `gap` prop as itself: either way the list spaces its rows like a flex
/// container, by the gap along its axis, and a grid's columns by the column gap.
@MainActor
final class KuitoListGapTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
    }

    func testAHorizontalListSpacesRowsByItsColumnGap() throws {
        let list = try makeList(kind: "HorizontalList", gaps: ["rowGap": 4, "columnGap": 12])

        XCTAssertEqual(try second(list).minX, 124 + 12)
    }

    func testAVerticalListSpacesRowsByItsRowGap() throws {
        let list = try makeList(kind: "List", gaps: ["rowGap": 12, "columnGap": 4])

        XCTAssertEqual(try second(list).minY, 200 + 12)
    }

    func testAGridSpacesColumnsByItsColumnGap() throws {
        let list = try makeList(kind: "List", gaps: ["rowGap": 4, "columnGap": 20])

        list.layout.numColumns = 2

        XCTAssertEqual(try second(list).minX, (320 - 20) / 2 + 20)
    }

    func testAnInlineGapSpacesBothAxes() throws {
        let list = try makeList(kind: "List", gaps: ["gap": 8])

        list.layout.keys = ["a", "b", "c"]
        list.layout.setSize(CGSize(width: 124, height: 200), of: "c")
        list.layout.numColumns = 2

        XCTAssertEqual(try second(list).minX, (320 - 8) / 2 + 8)
        XCTAssertEqual(try XCTUnwrap(list.layout.frame(at: 2)).minY, 200 + 8)
    }

    private func makeList(kind: String, gaps: [String: Double]) throws -> KuitoListView {
        try renderer.createView(id: 1, kind: kind, parent: 0, label: "list")
        try renderer.setProperty(id: 1, name: "width", value: .number(320))
        try renderer.setProperty(id: 1, name: "height", value: .number(640))

        for (name, value) in gaps.sorted(by: { $0.key < $1.key }) {
            try renderer.setProperty(id: 1, name: name, value: .number(value))
        }

        container.layoutIfNeeded()

        let list = try XCTUnwrap(firstList(in: container))

        list.layoutIfNeeded()
        list.layout.keys = ["a", "b"]

        for key in ["a", "b"] { list.layout.setSize(CGSize(width: 124, height: 200), of: key) }

        return list
    }

    private func firstList(in view: UIView) -> KuitoListView? {
        (view as? KuitoListView) ?? view.subviews.lazy.compactMap(firstList).first
    }

    private func second(_ list: KuitoListView) throws -> CGRect {
        try XCTUnwrap(list.layout.frame(at: 1))
    }
}

/// A sticky row stays at the top of the viewport while its section scrolls
/// under it, and the next sticky row pushes it up as it arrives.
@MainActor
final class KuitoListStickyTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 400))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
    }

    func testAStickyRowStaysAtTheTopOfItsSection() throws {
        let list = try makeList()

        XCTAssertEqual(try pinnedY(of: 0, in: list, offset: 150), 150)
        XCTAssertEqual(try pinnedY(of: 0, in: list, offset: 0), 0, "at its own place before it reaches the top")
    }

    func testTheNextStickyRowPushesItUp() throws {
        let list = try makeList()

        XCTAssertEqual(try pinnedY(of: 0, in: list, offset: 250), 200)
        XCTAssertEqual(try pinnedY(of: 3, in: list, offset: 320), 320)
        XCTAssertNil(try attributes(of: 0, in: list, offset: 320), "the first one has scrolled away")
    }

    /// Twelve rows 100 long; rows 0 and 3 stick.
    private func makeList() throws -> KuitoListView {
        try renderer.createView(id: 1, kind: "List", parent: 0, label: "list")
        try renderer.setProperty(id: 1, name: "width", value: .number(320))
        try renderer.setProperty(id: 1, name: "height", value: .number(400))
        container.layoutIfNeeded()

        let list = try XCTUnwrap(firstList(in: container))
        let keys = (0..<12).map { "k\($0)" }

        list.layoutIfNeeded()
        list.layout.keys = keys

        for key in keys { list.layout.setSize(CGSize(width: 320, height: 100), of: key) }

        try renderer.setProperty(id: 1, name: "stickyKeys", value: Structured.keys(["k0", "k3"]))

        return list
    }

    private func attributes(of index: Int, in list: KuitoListView, offset: CGFloat) throws -> UICollectionViewLayoutAttributes? {
        list.collection.contentOffset = CGPoint(x: 0, y: offset)

        let visible = CGRect(x: 0, y: offset, width: 320, height: 400)

        return list.layout.layoutAttributesForElements(in: visible)?.first { $0.indexPath.item == index }
    }

    private func pinnedY(of index: Int, in list: KuitoListView, offset: CGFloat) throws -> CGFloat {
        let found = try XCTUnwrap(try attributes(of: index, in: list, offset: offset))

        XCTAssertGreaterThan(found.zIndex, 0, "a sticky row draws over the rows under it")

        return found.frame.minY
    }

    private func firstList(in view: UIView) -> KuitoListView? {
        (view as? KuitoListView) ?? view.subviews.lazy.compactMap(firstList).first
    }
}
