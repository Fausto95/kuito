import UIKit
import XCTest

/// A scroll request lands once the layout has sized the content it came
/// with; paging and snap offsets decide where a drag comes to rest.
@MainActor
final class KuitoScrollViewTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
    }

    func testAnOffsetRequestScrollsThere() throws {
        let scroll = try makeScroll()

        try request(Structured.scroll(toOffset: 120, animated: false), on: scroll)

        XCTAssertEqual(scroll.contentOffset.y, 120)
    }

    func testAnOffsetPastTheEndStopsAtTheEnd() throws {
        let scroll = try makeScroll()

        try request(Structured.scroll(toOffset: 5000, animated: false), on: scroll)

        XCTAssertEqual(scroll.contentOffset.y, 600, "1000 points of content in 400")
    }

    func testAnEndRequestReachesContentAddedWithIt() throws {
        let scroll = try makeScroll()

        try renderer.createView(id: 3, kind: "Box", parent: 1, label: "more")
        try renderer.setProperty(id: 3, name: "height", value: .number(500))
        try request(Structured.scrollToEnd(animated: false), on: scroll)

        XCTAssertEqual(scroll.contentOffset.y, 1100, "1500 points of content in 400")
    }

    func testAHorizontalScrollScrollsSideways() throws {
        let scroll = try makeScroll(kind: "HorizontalScroll")

        try request(Structured.scroll(toOffset: 50, animated: false), on: scroll)

        XCTAssertEqual(scroll.contentOffset, CGPoint(x: 50, y: 0))
    }

    func testPagingPagesTheScrollView() throws {
        let scroll = try makeScroll()

        try renderer.setProperty(id: 1, name: "paging", value: .bool(true))

        XCTAssertTrue(scroll.isPagingEnabled)
    }

    func testADragComesToRestAtTheSnapOffsetNearestWhereItWouldStop() throws {
        let scroll = try makeScroll()

        try renderer.setProperty(id: 1, name: "snapOffsets", value: Structured.snapOffsets([0, 280, 560]))
        scroll.contentOffset = CGPoint(x: 0, y: 200)

        var target = CGPoint(x: 0, y: 300)

        scroll.scrollViewWillEndDragging(scroll, withVelocity: CGPoint(x: 0, y: 0.5), targetContentOffset: &target)

        XCTAssertEqual(target.y, 280)
    }

    func testSnapOffsetsAreAList() throws {
        _ = try makeScroll()

        XCTAssertThrowsError(try renderer.setProperty(id: 1, name: "snapOffsets", value: .number(280))) { error in
            guard case KuitoRenderError.unsupportedValue("snapOffsets", _, _, _) = error else {
                return XCTFail("\(error)")
            }
        }
    }

    /// Only a list has keys to scroll to.
    func testAScrollViewTakesNoKeyRequest() throws {
        _ = try makeScroll()

        XCTAssertThrowsError(try renderer.setProperty(id: 1, name: "scrollTo", value: Structured.scroll(toKey: "a"))) { error in
            guard case KuitoRenderError.unsupportedValue("scrollTo", _, _, _) = error else {
                return XCTFail("\(error)")
            }
        }
    }

    /// A page is a whole view length, as paging rests: 320 points across.
    func testAPageRequestScrollsAWholeViewLengthEach() throws {
        let scroll = try makeScroll(kind: "HorizontalScroll")

        try request(Structured.scroll(toPage: 2, animated: false), on: scroll)
        XCTAssertEqual(scroll.contentOffset.x, 640)

        try request(Structured.scroll(toPage: 5, animated: false), on: scroll)
        XCTAssertEqual(scroll.contentOffset.x, 680, "a page past the end stops at the end of 1000 points")
    }

    func testItSendsWhereItComesToRest() throws {
        let scroll = try makeScroll(kind: "HorizontalScroll")
        var rests: [[Double]] = []

        renderer.onEvent = { id, event, record in
            if id == 1, event == "scrollend" { rests.append(record.numbers) }

            return false
        }

        scroll.contentOffset = CGPoint(x: 100, y: 0)
        XCTAssertEqual(rests, [], "moving is not resting")

        scroll.scrollViewDidEndDragging(scroll, willDecelerate: true)
        XCTAssertEqual(rests, [], "a drag that lets go into a fling still moves")

        scroll.scrollViewDidEndDecelerating(scroll)
        XCTAssertEqual(rests, [[100, 0, 1000, 400, 320, 400]])

        scroll.contentOffset = CGPoint(x: 120, y: 0)
        scroll.scrollViewDidEndDragging(scroll, willDecelerate: false)
        XCTAssertEqual(rests.last, [120, 0, 1000, 400, 320, 400], "a drag that stops where it lets go")

        try request(Structured.scroll(toPage: 1, animated: false), on: scroll)
        XCTAssertEqual(rests.last, [320, 0, 1000, 400, 320, 400], "a request that jumps there")

        scroll.scrollViewDidEndScrollingAnimation(scroll)
        XCTAssertEqual(rests.count, 4, "and one that animates there, once it lands")
    }

    func testAFlingMovesOnToTheNextOffsetEvenWhenItWouldStopShort() {
        let points: [CGFloat] = [0, 280, 560]

        XCTAssertEqual(rest(points, current: 290, projected: 300, velocity: 1), 560, "280 is behind it")
        XCTAssertEqual(rest(points, current: 290, projected: 300, velocity: -1), 280)
        XCTAssertEqual(rest(points, current: 400, projected: 400, velocity: 0), 280, "at rest, the nearest")
    }

    func testTheStartAndEndAreRestingPointsToo() {
        XCTAssertEqual(rest([280], current: 590, projected: 600, velocity: 0), 600, "content after the last offset stays reachable")
        XCTAssertEqual(rest([280], current: 60, projected: 50, velocity: 0), 0)
        XCTAssertEqual(rest([900], current: 500, projected: 520, velocity: 1), 600, "an offset past the end is the end")
    }

    func testAScrollGivenMotionSendsWhereItIsAsItMovesAndOnceAtRest() throws {
        let scroll = try makeScroll()
        var sent: [[Double]] = []
        var time: CFTimeInterval = 1

        renderer.onEvent = { id, event, record in
            if id == 1, event == "motion" { sent.append(record.numbers) }

            return false
        }
        scroll.motion.clock = { time }
        scroll.contentOffset = CGPoint(x: 0, y: 10)
        XCTAssertEqual(sent, [], "nothing until the app asks for it")

        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(true))
        XCTAssertEqual(sent, [], "not inside the batch that asked: its UI-thread handler comes after the views")

        scroll.motion.frame()
        XCTAssertEqual(sent, [[10, 0, 0]], "where it is, at rest, on the next display frame")

        time = 1.125
        scroll.contentOffset = CGPoint(x: 0, y: 110)
        XCTAssertEqual(sent.last, [110, 0, 0], "a first move from rest has no speed yet")

        time = 1.140625
        scroll.contentOffset = CGPoint(x: 0, y: 130)
        XCTAssertEqual(sent.last, [130, 1280, 0], "20 points in a 64th of a second")

        time = 1.15625
        scroll.contentOffset = CGPoint(x: 0, y: -30)
        XCTAssertEqual(sent.last, [0, -10240, -30], "pulled 30 points past the top")

        time = 1.171875
        scroll.contentOffset = CGPoint(x: 0, y: 650)
        XCTAssertEqual(sent.last, [600, 43520, 50], "50 past the end of 600")

        let moving = sent.count

        time = 1.19
        scroll.motion.frame()
        XCTAssertEqual(sent.count, moving, "a frame later it may still be moving")

        time = 1.25
        scroll.motion.frame()
        XCTAssertEqual(Array(sent.dropFirst(moving)), [[600, 0, 50]], "still for two frames, at rest")
    }

    func testAHorizontalScrollSendsItsOffsetAlongItsAxis() throws {
        let scroll = try makeScroll(kind: "HorizontalScroll")
        var sent: [[Double]] = []

        renderer.onEvent = { _, event, record in
            if event == "motion" { sent.append(record.numbers) }

            return false
        }
        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(true))
        scroll.contentOffset = CGPoint(x: 70, y: 0)

        XCTAssertEqual(sent.last?.first, 70)
    }

    func testAScrollStopsSendingItsMotionWhenTheAppNoLongerAsks() throws {
        let scroll = try makeScroll()
        var sent = 0

        renderer.onEvent = { _, event, _ in
            if event == "motion" { sent += 1 }

            return false
        }
        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(true))
        scroll.motion.frame()
        try renderer.setProperty(id: 1, name: "emitsMotion", value: .bool(false))
        scroll.contentOffset = CGPoint(x: 0, y: 40)
        scroll.motion.frame()

        XCTAssertEqual(sent, 1)
    }

    private func rest(_ points: [CGFloat], current: CGFloat, projected: CGFloat, velocity: CGFloat) -> CGFloat {
        KuitoScrollSnap.restingOffset(points: points, current: current, projected: projected, velocity: velocity, maximum: 600)
    }

    /// A 320×400 scroll view holding 1000 points of content along its axis.
    private func makeScroll(kind: String = "Scroll") throws -> KuitoScrollView {
        let vertical = kind == "Scroll"

        try renderer.createView(id: 1, kind: kind, parent: 0, label: "scroll")
        try renderer.setProperty(id: 1, name: "width", value: .number(320))
        try renderer.setProperty(id: 1, name: "height", value: .number(400))
        // A Scroll grows by default: kept at 400, its end is 600 into 1000 points.
        try renderer.setProperty(id: 1, name: "flexGrow", value: .number(0))
        try renderer.createView(id: 2, kind: "Box", parent: 1, label: "content")
        try renderer.setProperty(id: 2, name: vertical ? "height" : "width", value: .number(1000))
        try renderer.setProperty(id: 2, name: vertical ? "width" : "height", value: .number(vertical ? 320 : 400))
        container.layoutIfNeeded()

        return try XCTUnwrap(renderer.nodes[1]?.view as? KuitoScrollView)
    }

    private func request(_ value: KuitoValue, on scroll: KuitoScrollView) throws {
        try renderer.setProperty(id: 1, name: "scrollTo", value: value)
        container.layoutIfNeeded()
        scroll.layoutIfNeeded()
    }
}
