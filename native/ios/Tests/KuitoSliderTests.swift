import UIKit
import XCTest

/// Slider (native/modules/slider): a UISlider over `min`…`max`. Its `change`
/// and `changeEnd` carry the value the user moved it to.
@MainActor
final class KuitoSliderTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1
    private var sent: [String] = []

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:Slider",
            KuitoModuleView(KuitoSliderView.self, KuitoSliderView.define).kind(events: ["change", "changeEnd"])
        )
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: id, kind: "module:Slider", parent: 0, label: "view")
    }

    private var slider: KuitoSliderView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoSliderView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    /// What a drag does: UIKit moves the thumb, then sends `.valueChanged`.
    private func drag(to value: Float) throws {
        let slider = try slider

        slider.value = value
        slider.sendActions(for: .valueChanged)
    }

    func testTheAppsValueSendsNoChange() throws {
        try set("value", .number(0.5))

        XCTAssertEqual(try slider.value, 0.5)
        XCTAssertEqual(sent, [])
    }

    func testTheUsersDragSendsItsValue() throws {
        try drag(to: 0.5)

        XCTAssertEqual(sent, [#"change {"value":0.5}"#])
    }

    func testNewBoundsKeepWhereTheUserLeftTheThumb() throws {
        try set("value", .number(0.25))
        try drag(to: 0.75)

        try set("max", .number(2))
        XCTAssertEqual(try slider.value, 0.75, "the thumb went back to the app's last value")

        try set("min", .number(0.5))
        XCTAssertEqual(try slider.value, 0.75)
    }

    func testTheAppsValueAfterADragMovesTheThumb() throws {
        try drag(to: 0.75)
        try set("value", .number(0.25))

        XCTAssertEqual(try slider.value, 0.25)
    }

    func testHexColorsTintTheTrack() throws {
        try set("fillColor", .text("#ff0000"))
        try set("trackColor", .text("#00ff0080"))

        XCTAssertEqual(try slider.minimumTrackTintColor, UIColor(red: 1, green: 0, blue: 0, alpha: 1))
        XCTAssertEqual(try slider.maximumTrackTintColor, UIColor(red: 0, green: 1, blue: 0, alpha: 128.0 / 255))

        try set("fillColor", .null)
        XCTAssertNil(try slider.minimumTrackTintColor)
    }

    func testAColorThatIsNotHexIsUnsupported() {
        for value in ["red", "#12", "#gggggg", "ff0000"] {
            XCTAssertThrowsError(try set("fillColor", .text(value)), value) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, let reason) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "fillColor")
                XCTAssertTrue(reason.contains("is not a CSS hex color"), reason)
            }
        }
    }
}
