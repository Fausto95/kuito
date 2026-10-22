import UIKit
import XCTest

/// A gesture's event carries the fields its kind reports (docs/motion.md),
/// and leaves the others out.
@MainActor
final class KuitoGesturePayloadTests: XCTestCase {
    func testAPanReportsItsTranslationAndNoScale() throws {
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        let pan = KuitoPanGestureHandler(tag: 41)
        var sent: [KuitoGesturePayload] = []

        pan.bind(to: view) { sent.append($0) }
        defer { pan.unbindFromView() }
        pan.handleGesture(pan.recognizer, inState: .began)

        let payload = try XCTUnwrap(sent.first)

        XCTAssertEqual(payload.handlerTag, 41)
        XCTAssertEqual(payload.state, Double(KuitoGestureState.began.rawValue))
        XCTAssertEqual(payload.oldState, Double(KuitoGestureState.undetermined.rawValue))
        XCTAssertEqual(payload.translationX, 0)
        XCTAssertEqual(payload.translationY, 0)
        XCTAssertNil(payload.scale)
        XCTAssertNil(payload.rotation)
    }
}
