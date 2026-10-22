import UIKit
import XCTest

/// keyboard.height (docs/keyboard.md#keyboard): once the app asks, the
/// keyboard's height over the root's bottom goes out on every display frame
/// it changes, as `keyboard.move`, read from the keyboard layout guide.
@MainActor
final class KuitoKeyboardMotionTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private var heights: [Double] = []

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        renderer.onEvent = { [unowned self] id, event, record in
            if id == 0, event == "keyboard.move" { heights.append(contentsOf: record.numbers) }

            return false
        }
    }

    func testTheHeightGoesOutOnEachFrameItChangesOnceTheAppAsks() throws {
        var height: CGFloat = 0
        let motion = renderer.keyboard.motion

        motion.measure = { height }
        motion.frame()
        XCTAssertEqual(heights, [], "nothing until the app asks")

        try renderer.command(id: 0, name: "keyboard.motion", argument: "on")
        XCTAssertEqual(heights, [], "not inside the batch that asked: its UI-thread handler comes after it")

        motion.frame()
        XCTAssertEqual(heights, [0], "where it is, on the next display frame")

        height = 120
        motion.frame()
        height = 336
        motion.frame()
        motion.frame()
        XCTAssertEqual(heights, [0, 120, 336], "each frame it moved, none it held still")

        try renderer.command(id: 0, name: "keyboard.motion", argument: "off")
        height = 0
        motion.frame()
        XCTAssertEqual(heights, [0, 120, 336])
    }

    func testAHiddenKeyboardStandsZeroOverTheRoot() throws {
        try renderer.command(id: 0, name: "keyboard.motion", argument: "on")
        container.layoutIfNeeded()

        XCTAssertEqual(renderer.keyboard.motion.measure(), 0)
    }
}
