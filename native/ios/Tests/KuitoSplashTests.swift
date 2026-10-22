import UIKit
import XCTest

/// The launch screen stays until the app's first frame with content: the
/// first batch in which the renderer creates a view, which the shell hears
/// as the renderer's `onUpdate` (docs/splash.md#until-the-app-is-ready).
/// Every shell keeps it, Splash module or not.
@MainActor
final class KuitoSplashTests: XCTestCase {
    private var host: UIView!
    private var overlay: UIView!
    private var splash: KuitoSplash!
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        host = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        overlay = UIView()
        splash = KuitoSplash()
        splash.install(overlay, in: host) { false }

        let surface = UIView(frame: host.bounds)

        host.insertSubview(surface, at: 0)
        renderer = KuitoUIKitRenderer(container: surface)

        // As the shell wires it: the first update is the first frame with content.
        var hasFirstFrame = false

        renderer.onUpdate = { [splash] _ in
            guard !hasFirstFrame else { return }

            hasFirstFrame = true
            splash?.firstFrame()
        }
    }

    func testAFrameWithNoViewKeepsIt() {
        splash.framesCommitted()

        XCTAssertTrue(splash.isVisible)
        XCTAssertTrue(overlay.superview === host)
    }

    func testTheFirstViewTheAppRendersHidesIt() throws {
        try renderer.createView(id: 1, kind: "Box", parent: 0, label: "screen")

        XCTAssertFalse(splash.isVisible)
        XCTAssertNil(overlay.superview)
    }

    func testAKeptSplashWaitsForHide() throws {
        splash.preventAutoHide()
        try renderer.createView(id: 1, kind: "Box", parent: 0, label: "screen")

        XCTAssertTrue(splash.isVisible)

        var hidden = false

        splash.hide(fade: false) { hidden = true }

        XCTAssertTrue(hidden)
        XCTAssertNil(overlay.superview)
    }

    func testUIThreadMotionIsNoContent() throws {
        splash.preventAutoHide()
        try renderer.createView(id: 1, kind: "Box", parent: 0, label: "screen")

        var updates = 0

        renderer.onUpdate = { _ in updates += 1 }
        try renderer.setDrivenProperty(id: 1, name: "opacity", value: .number(0.5))

        XCTAssertEqual(updates, 0)
    }
}
