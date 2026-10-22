import UIKit
import XCTest

/// Structured props arrive as records C++ checked against their schemas
/// (docs/native-scheduling.md#structured-props). What a schema cannot say
/// stays the setter's to reject: a gesture config key its type lacks, a
/// selection out of order, a snap point that names no height.
@MainActor
final class KuitoStructuredPropTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let view: UInt32 = 1

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
    }

    // MARK: - Gestures

    func testEachGestureGetsItsRecognizer() throws {
        try make("Box")
        try set("gestures", Structured.gestures([
            .init(tag: 1, type: .tap, config: ["numberOfTaps": .number(2), "enabled": .flag(true)]),
            .init(tag: 2, type: .pan, config: ["hitSlop": .edges(["horizontal": 10])], waitFor: [1]),
        ]))

        XCTAssertEqual(try made().gestureRecognizers?.count, 2)

        try set("gestures", .null)

        XCTAssertEqual(try made().gestureRecognizers?.count ?? 0, 0)
    }

    func testGesturesRepeatingATagAreUnsupported() throws {
        try make("Box")

        assertUnsupported("gestures", Structured.gestures([.init(tag: 1, type: .tap), .init(tag: 1, type: .pan)]))
    }

    func testAConfigKeyTheGesturesTypeLacksIsUnsupported() throws {
        try make("Box")

        assertUnsupported("gestures", Structured.gesture(1, .tap, config: ["minVelocity": .number(1)]))
    }

    func testAConfigValueOfAnotherKindIsUnsupported() throws {
        try make("Box")

        for config: [String: Structured.ConfigEntry] in [
            ["numberOfTaps": .number(1.5)],
            ["maxDist": .flag(true)],
            ["enabled": .number(1)],
            ["hitSlop": .flag(true)],
            ["hitSlop": .edges(["width": 20])],
        ] {
            assertUnsupported("gestures", Structured.gesture(1, .tap, config: config))
        }
    }

    func testAHitSlopNumberReachesPastEveryEdge() throws {
        let slop = try XCTUnwrap(KuitoGestureHitSlop(try entry(.number(10))))

        XCTAssertEqual(slop.inset(CGRect(x: 0, y: 0, width: 100, height: 100)), CGRect(x: -10, y: -10, width: 120, height: 120))
    }

    func testAHitSlopEdgeWinsOverItsAxis() throws {
        let slop = try XCTUnwrap(KuitoGestureHitSlop(try entry(.edges(["horizontal": 5, "left": 20]))))

        XCTAssertEqual(slop.inset(CGRect(x: 0, y: 0, width: 100, height: 100)), CGRect(x: -20, y: 0, width: 125, height: 100))
    }

    // MARK: - Layout animation and gradient

    func testALayoutAnimationIsATimingCurveOrASpring() throws {
        try make("Box")
        try set("layout", Structured.timing(duration: 200, delay: 100))

        guard case .timing(let duration, let curve, let delay)? = try animation() else { return XCTFail("no timing") }

        XCTAssertEqual(duration, 0.2, accuracy: 1e-9)
        XCTAssertEqual(curve, [0.42, 0, 0.58, 1])
        XCTAssertEqual(delay, 0.1, accuracy: 1e-9)

        try set("layout", Structured.spring(damping: 12, stiffness: 180, mass: 1))

        guard case .spring(let damping, let stiffness, _, _)? = try animation() else { return XCTFail("no spring") }

        XCTAssertEqual([damping, stiffness], [12, 180])

        try set("layout", .null)

        XCTAssertNil(try animation())
    }

    func testATimingCurveIsFourNumbers() throws {
        try make("Box")

        assertUnsupported("layout", Structured.timing(duration: 200, easing: [0.42, 0, 0.58]))
    }

    func testAGradientDrawsBehindTheView() throws {
        try make("Box")
        try set("backgroundGradient", Structured.gradient(angle: 90, colors: [0xff0000ff, 0x0000ffff]))

        XCTAssertNotNil(try node().gradient)

        try set("backgroundGradient", .null)

        XCTAssertNil(try node().gradient)
    }

    // MARK: - Symbols and tab icons

    func testASymbolTakesItsIOSName() throws {
        try make("Symbol")
        try set("name", Structured.symbol(ios: "star.fill", android: "star"))

        XCTAssertEqual(Mirror(reflecting: try made()).children.first { $0.label == "name" }?.value as? String, "star.fill")

        assertUnsupported("name", Structured.symbol("no.such.symbol"))
    }

    func testATabIconIsASymbolOrTheIOSOne() throws {
        try renderer.createView(id: 2, kind: "NavigationTabs", parent: 0, label: "tabs")
        try renderer.createView(id: view, kind: "NavigationTab", parent: 2, label: "tab")
        try set("icon", Structured.icon(ios: "star", android: nil))

        XCTAssertNotNil(try tab().icon)

        try set("icon", Structured.icon(ios: nil, android: "star"))

        XCTAssertNil(try tab().icon, "no iOS symbol is no icon")

        try set("icon", Structured.icon(symbol: "house"))

        XCTAssertNotNil(try tab().icon)
    }

    // MARK: - Containers

    func testASafeAreaPadsTheEdgesItNames() throws {
        try make("SafeArea")
        try set("edges", Structured.edges([.top, .bottom]))

        XCTAssertEqual(try XCTUnwrap(made() as? KuitoSafeAreaView).edges, [.top, .bottom])
    }

    func testSnapPointsArePointsPercentagesOrTheContent() throws {
        try make("Sheet")
        try set("snapPoints", Structured.snapPoints([.height(200), .named("50%"), .named("content")]))

        XCTAssertEqual(try XCTUnwrap(made() as? KuitoSheetView).snapPoints, [.points(200), .fraction(0.5), .content])

        try set("snapPoints", Structured.snapPoints([]))

        XCTAssertEqual(try XCTUnwrap(made() as? KuitoSheetView).snapPoints, [.content])

        assertUnsupported("snapPoints", Structured.snapPoints([.named("half")]))
    }

    func testAListScrollsToAKeyAnOffsetOrItsEnd() throws {
        try make("List")

        for request in [Structured.scroll(toKey: "a", animated: false, align: 0.5, margin: 8), Structured.scroll(toOffset: 40), Structured.scrollToEnd()] {
            XCTAssertNoThrow(try set("scrollTo", request))
        }

        assertUnsupported("scrollTo", Structured.scroll(toPage: 1))
    }

    // MARK: - Accessibility

    func testActionsKeepTheirLabels() throws {
        try make("Box")
        try set("actions", Structured.actions([("activate", nil), ("archive", "Archive")]))

        let actions = try node().accessibility.actions

        XCTAssertEqual(actions.map(\.name), ["activate", "archive"])
        XCTAssertEqual(actions.map(\.label), [nil, "Archive"])
    }

    // MARK: - Support

    private func make(_ kind: String) throws {
        try renderer.createView(id: view, kind: kind, parent: 0, label: kind)
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: view, name: name, value: value)
    }

    private func node() throws -> KuitoViewStyle {
        try XCTUnwrap(renderer.nodes[view])
    }

    private func made() throws -> UIView {
        try XCTUnwrap(node().view)
    }

    private func tab() throws -> KuitoNavigationTabView {
        try XCTUnwrap(made() as? KuitoNavigationTabView)
    }

    private func animation() throws -> KuitoAnimationSpec? {
        (try node().layout.frameAnimation as? KuitoFrameAnimation)?.spec
    }

    /// A gesture config entry as the generated type reads it from its record.
    private func entry(_ entry: Structured.ConfigEntry) throws -> KuitoGestureConfigEntryValue {
        var writer = KuitoRecordWriter()

        Structured.write(entry, to: &writer)

        var reader = KuitoStructReader(writer.record)

        return KuitoGestureConfigEntryValue(&reader)
    }

    private func assertUnsupported(_ name: String, _ value: KuitoValue, line: UInt = #line) {
        XCTAssertThrowsError(try set(name, value), "\(name): \(value)", line: line) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error, prop == name else {
                return XCTFail("\(name) threw \(error), not unsupportedValue", line: line)
            }
        }
    }
}
