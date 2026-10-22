import UIKit
import XCTest

/// The state changes a recognizer's moves send the app, decided by the shared
/// rules (native/shared/gestures/GestureEvents.h).
@MainActor
final class KuitoGestureEventsTests: XCTestCase {
    private func sent(_ moves: [KuitoGestureState]) -> [String] {
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        let pan = KuitoPanGestureHandler(tag: 1)
        var sent: [String] = []

        pan.bind(to: view) { payload in
            guard let old = payload.oldState else { return }

            sent.append("\(Int(old)) -> \(Int(payload.state))")
        }
        defer { pan.unbindFromView() }

        for state in moves { pan.handleGesture(pan.recognizer, inState: state) }

        return sent
    }

    func testAGestureThatEndsWithoutActivatingIsHeardActivatingFirst() {
        XCTAssertEqual(sent([.began, .end]), ["0 -> 2", "2 -> 4", "4 -> 5"])
    }

    func testAnEndedGestureIsNotCancelledAfterwards() {
        XCTAssertEqual(sent([.began, .active, .end, .cancelled]), ["0 -> 2", "2 -> 4", "4 -> 5"])
    }

    /// No onFinalize without onBegin, as on Android.
    func testAGestureCancelledBeforeItBeganSendsNothing() {
        XCTAssertEqual(sent([.cancelled]), [])
        XCTAssertEqual(sent([.failed]), [])
    }
}
