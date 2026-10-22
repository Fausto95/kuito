import UIKit
import XCTest

/// The delegate answers UIKit's arbitration questions from the shared
/// relations (native/shared/gestures/GestureRelations.h).
@MainActor
final class KuitoGestureRelationsTests: XCTestCase {
    private var bound: [KuitoGestureHandler] = []

    override func tearDown() {
        MainActor.assumeIsolated {
            bound.forEach { $0.unbindFromView() }
            bound.removeAll()
        }
        super.tearDown()
    }

    private func bind<Handler: KuitoGestureHandler>(
        _ handler: Handler,
        waitFor: [Int] = [],
        simultaneous: [Int] = [],
        blocks: [Int] = []
    ) -> Handler {
        handler.updateRelations(KuitoGestureRelations(waitFor: waitFor, simultaneousHandlers: simultaneous, blocksHandlers: blocks))
        handler.bind(to: UIView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))) { _ in }
        bound.append(handler)

        return handler
    }

    func testWaitForMakesTheGestureRequireTheOthersFailure() {
        let tap = bind(KuitoTapGestureHandler(tag: 1), waitFor: [2])
        let pan = bind(KuitoPanGestureHandler(tag: 2))

        XCTAssertTrue(tap.gestureRecognizer(tap.recognizer, shouldRequireFailureOf: pan.recognizer))
        XCTAssertFalse(pan.gestureRecognizer(pan.recognizer, shouldRequireFailureOf: tap.recognizer))
    }

    func testBlocksMakesTheOtherGestureRequireItsFailure() {
        let tap = bind(KuitoTapGestureHandler(tag: 1))
        let pan = bind(KuitoPanGestureHandler(tag: 2), blocks: [1])

        XCTAssertTrue(tap.gestureRecognizer(tap.recognizer, shouldRequireFailureOf: pan.recognizer))
        XCTAssertTrue(pan.gestureRecognizer(pan.recognizer, shouldBeRequiredToFailBy: tap.recognizer))
        XCTAssertFalse(pan.gestureRecognizer(pan.recognizer, shouldRequireFailureOf: tap.recognizer))
    }

    func testSimultaneousGoesBothWays() {
        let pinch = bind(KuitoPinchGestureHandler(tag: 1), simultaneous: [2])
        let rotation = bind(KuitoRotationGestureHandler(tag: 2))

        XCTAssertTrue(pinch.gestureRecognizer(pinch.recognizer, shouldRecognizeSimultaneouslyWith: rotation.recognizer))
        XCTAssertTrue(rotation.gestureRecognizer(rotation.recognizer, shouldRecognizeSimultaneouslyWith: pinch.recognizer))
    }

    func testAGestureDoesNotBeginWhileOneItWaitsForIsActive() {
        let pan = bind(KuitoPanGestureHandler(tag: 1), waitFor: [2])
        let other = bind(KuitoPanGestureHandler(tag: 2))

        other.handleGesture(other.recognizer, inState: .active)

        XCTAssertFalse(pan.gestureRecognizerShouldBegin(pan.recognizer))
    }

    func testAGestureDoesNotBeginWhileOneBlockingItIsActive() {
        let pan = bind(KuitoPanGestureHandler(tag: 1))
        let blocking = bind(KuitoPanGestureHandler(tag: 2), blocks: [1])

        blocking.handleGesture(blocking.recognizer, inState: .active)

        XCTAssertFalse(pan.gestureRecognizerShouldBegin(pan.recognizer))
    }

    func testAGestureMovedToAnotherViewKeepsItsRelations() {
        let old = bind(KuitoTapGestureHandler(tag: 1), waitFor: [2])
        let moved = bind(KuitoTapGestureHandler(tag: 1), waitFor: [3])
        let pan = bind(KuitoPanGestureHandler(tag: 3))

        old.unbindFromView()

        XCTAssertTrue(moved.gestureRecognizer(moved.recognizer, shouldRequireFailureOf: pan.recognizer))
    }
}
