import UIKit
import XCTest

/// A cleared tree is gone for JavaScript: a reload starts a runtime whose view
/// ids repeat the old tree's, so an event from an old view, such as an image
/// load that finishes late, would reach a handler that was never registered.
@MainActor
final class KuitoRendererEventTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    /// Each event's view and name; payloads are KuitoEventEmitterTests' concern.
    private var sent: [String] = []
    private let boxID: UInt32 = 1
    private let imageID: UInt32 = 2
    private let toggleID: UInt32 = 3

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        renderer.onEvent = { [unowned self] id, event, _ in
            sent.append("\(id).\(event)")

            return false
        }
        try renderer.createView(id: boxID, kind: "Box", parent: 0, label: "box")
        try renderer.createView(id: imageID, kind: "Image", parent: boxID, label: "image")
        try renderer.createView(id: toggleID, kind: "Toggle", parent: boxID, label: "toggle")
    }

    func testAViewSendsItsEvents() throws {
        try view(KuitoImageView.self).emit?("load", KuitoImageSizePayload(width: 1, height: 1))

        XCTAssertEqual(sent, ["\(imageID).load"])
    }

    func testAnImageClearedWhileLoadingSendsNothing() throws {
        let image = try view(KuitoImageView.self)

        renderer.clear()
        image.emit?("load", KuitoImageSizePayload(width: 1, height: 1))
        image.emit?("loadend", nil)

        XCTAssertEqual(sent, [])
    }

    func testAClearedControlSendsNothing() throws {
        let toggle = try view(UISwitch.self)

        renderer.clear()
        toggle.isOn = true
        toggle.sendActions(for: .valueChanged)

        XCTAssertEqual(sent, [])
    }

    func testTheNextTreeSendsItsEvents() throws {
        renderer.clear()
        try renderer.createView(id: toggleID, kind: "Toggle", parent: 0, label: "toggle")

        let toggle = try view(UISwitch.self)

        toggle.isOn = true
        toggle.sendActions(for: .valueChanged)

        XCTAssertEqual(sent, ["\(toggleID).change"])
    }

    private func view<View: UIView>(_ type: View.Type) throws -> View {
        try XCTUnwrap(descendant(of: container, type), "No \(type) in the tree")
    }

    private func descendant<View: UIView>(of view: UIView, _ type: View.Type) -> View? {
        view as? View ?? view.subviews.lazy.compactMap { self.descendant(of: $0, type) }.first
    }
}
