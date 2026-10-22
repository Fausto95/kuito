import UIKit
import XCTest

/// A value a prop does not accept is an error the renderer reports, never a
/// silent fallback to the prop's default (CLAUDE.md, Native code).
@MainActor
final class KuitoRendererPropertyTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let box: UInt32 = 1
    private let image: UInt32 = 2

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        try renderer.createView(id: box, kind: "Box", parent: 0, label: "box")
        try renderer.createView(id: image, kind: "Image", parent: box, label: "image")
    }

    func testAcceptsTheDocumentedValues() throws {
        XCTAssertNoThrow(try renderer.setProperty(id: box, name: "opacity", value: .number(0.5)))
        XCTAssertNoThrow(try renderer.setProperty(id: image, name: "objectFit", value: .enumValue(1, "contain")))
        XCTAssertNoThrow(try renderer.setProperty(id: image, name: "cache", value: .enumValue(1, "memory")))
    }

    /// Layout props take the batch's typed values: the renderer parses none.
    func testLayoutPropsParseNothing() throws {
        let before = KuitoParses.count

        try renderer.setProperty(id: box, name: "width", value: .text("50%"))
        try renderer.setProperty(id: box, name: "height", value: .number(40))
        try renderer.setProperty(id: box, name: "alignItems", value: .enumValue(5, "center"))
        try renderer.setProperty(id: box, name: "hidden", value: .bool(true))
        try renderer.setProperty(id: box, name: "flex", value: .null)

        XCTAssertEqual(KuitoParses.count, before)
    }

    /// Decoration props take the batch's typed values: the renderer parses none.
    func testDecorationPropsParseNothing() throws {
        let before = KuitoParses.count

        try renderer.setProperty(id: box, name: "borderRadius", value: .number(8))
        try renderer.setProperty(id: box, name: "borderWidth", value: .number(2))
        try renderer.setProperty(id: box, name: "borderColor", value: .color(0xff000080))
        try renderer.setProperty(id: box, name: "shadowColor", value: .color(0x00000040))
        try renderer.setProperty(id: box, name: "overflow", value: .enumValue(1, "hidden"))
        try renderer.setProperty(id: box, name: "backgroundGradient", value: Structured.gradient(angle: 90, colors: [0xff0000ff, 0x0000ffff]))

        XCTAssertEqual(KuitoParses.count, before)
    }

    func testAColorArrivesParsed() throws {
        try renderer.setProperty(id: box, name: "borderColor", value: .color(0xff000080))

        let color = try XCTUnwrap(view(box).layer.borderColor.map(UIColor.init(cgColor:)))
        var red: CGFloat = 0, alpha: CGFloat = 0

        color.getRed(&red, green: nil, blue: nil, alpha: &alpha)
        XCTAssertEqual(red, 1, accuracy: 0.01)
        XCTAssertEqual(alpha, 128.0 / 255, accuracy: 0.01)
    }

    func testANumberPropRejectsAColor() {
        assertUnsupportedValue(id: box, name: "borderRadius", value: .color(0xffffffff))
    }

    private func view(_ id: UInt32) throws -> UIView {
        try XCTUnwrap(renderer.nodes[id]?.layout.view)
    }

    /// Text props take the batch's typed values: the renderer parses none.
    func testTextPropsParseNothing() throws {
        let label: UInt32 = 3

        try renderer.createView(id: label, kind: "Text", parent: box, label: "label")

        let before = KuitoParses.count

        try renderer.setProperty(id: label, name: "text", value: .text("Hello"))
        try renderer.setProperty(id: label, name: "color", value: .color(0x112233ff))
        try renderer.setProperty(id: label, name: "fontSize", value: .number(20))
        try renderer.setProperty(id: label, name: "fontWeight", value: .enumValue(7, "600"))
        try renderer.setProperty(id: label, name: "textAlign", value: .enumValue(1, "center"))
        try renderer.setProperty(id: label, name: "lineClamp", value: .number(2))

        XCTAssertEqual(KuitoParses.count, before)
        XCTAssertEqual(renderer.nodes[label]?.text.weight, 600)
    }

    /// Image, press and control props take the batch's typed values: the renderer parses none.
    func testImageAndControlPropsParseNothing() throws {
        let pressable: UInt32 = 4, toggle: UInt32 = 5

        try renderer.createView(id: pressable, kind: "Pressable", parent: box, label: "pressable")
        try renderer.createView(id: toggle, kind: "Toggle", parent: box, label: "toggle")

        let before = KuitoParses.count

        try renderer.setProperty(id: image, name: "src", value: Structured.image(url: "https://example.com/a.png"))
        try renderer.setProperty(id: image, name: "src", value: Structured.image(uri: "https://example.com/b.png"))
        try renderer.setProperty(id: image, name: "placeholderColor", value: .color(0xccccccff))
        try renderer.setProperty(id: image, name: "tintColor", value: .color(0xff0000ff))
        try renderer.setProperty(id: image, name: "fadeDuration", value: .number(200))
        try renderer.setProperty(id: pressable, name: "pressedOpacity", value: .number(0.5))
        try renderer.setProperty(id: pressable, name: "longPressDuration", value: .number(400))
        try renderer.setProperty(id: pressable, name: "disabled", value: .bool(true))
        try renderer.setProperty(id: pressable, name: "haptic", value: .enumValue(0, "light"))
        try renderer.setProperty(id: toggle, name: "checked", value: .bool(true))

        XCTAssertEqual(KuitoParses.count, before)
    }

    /// List, scroll, safe-area, accessibility and gesture props take typed values: the renderer parses none.
    func testContainerAndAccessibilityPropsParseNothing() throws {
        let list: UInt32 = 6, scroll: UInt32 = 7, safeArea: UInt32 = 8

        try renderer.createView(id: list, kind: "List", parent: box, label: "list")
        try renderer.createView(id: scroll, kind: "Scroll", parent: box, label: "scroll")
        try renderer.createView(id: safeArea, kind: "SafeArea", parent: box, label: "safe")

        let before = KuitoParses.count

        try renderer.setProperty(id: list, name: "keys", value: .keys([KuitoKeyEdit(.insert, "a", at: 0), KuitoKeyEdit(.insert, "b", at: 1)]))
        try renderer.setProperty(id: list, name: "numColumns", value: .number(2))
        try renderer.setProperty(id: list, name: "inverted", value: .bool(true))
        try renderer.setProperty(id: scroll, name: "emitsScroll", value: .bool(true))
        try renderer.setProperty(id: scroll, name: "scrollInterval", value: .number(16))
        try renderer.setProperty(id: scroll, name: "keyboardDismissMode", value: .enumValue(1, "on-drag"))
        try renderer.setProperty(id: safeArea, name: "edges", value: Structured.edges([.top]))
        try renderer.setProperty(id: box, name: "accessible", value: .bool(true))
        try renderer.setProperty(id: box, name: "label", value: .text("Card"))
        try renderer.setProperty(id: box, name: "role", value: .enumValue(3, "button"))
        try renderer.setProperty(id: box, name: "aria-checked", value: .bool(true))
        try renderer.setProperty(id: box, name: "gestures", value: Structured.gestures([]))

        XCTAssertEqual(KuitoParses.count, before)
    }

    /// Animation props take the batch's typed values: the renderer parses none.
    func testAnimationPropsParseNothing() throws {
        let before = KuitoParses.count

        try renderer.setProperty(id: box, name: "opacity", value: .number(0.5))
        try renderer.setProperty(id: box, name: "backgroundColor", value: .color(0x336699ff))
        try renderer.setProperty(id: box, name: "translateX", value: .number(12))
        try renderer.setProperty(id: box, name: "scale", value: .null)
        try renderer.setProperty(id: box, name: "rotate", value: .number(45))
        try renderer.setProperty(id: box, name: "exit", value: .bool(true))
        try renderer.setProperty(id: box, name: "layout", value: Structured.timing(duration: 200))

        XCTAssertEqual(KuitoParses.count, before)
        XCTAssertEqual(try view(box).alpha, 0.5, accuracy: 0.01)
    }

    /// KuitoProps is generated from src/protocol/manifest.ts; a record's key
    /// finds its setter without hashing the prop's name.
    func testEveryManifestPropHasASetterByKey() {
        let keyed = KuitoProps.byKey.indices.filter { KuitoProperties.byKey[$0] != nil }

        XCTAssertEqual(KuitoProperties.byKey.count, KuitoProps.byKey.count)
        XCTAssertEqual(Set(keyed.map { KuitoProps.byKey[$0] }), KuitoProps.names)
    }

    func testOpacityRejectsANonNumber() {
        assertUnsupportedValue(id: box, name: "opacity", value: .text("x"))
    }

    func testObjectFitRejectsAnUnknownFit() {
        assertUnsupportedValue(id: image, name: "objectFit", value: .text("bogus"))
    }

    func testCacheRejectsAnUnknownPolicy() {
        assertUnsupportedValue(id: image, name: "cache", value: .text("bogus"))
    }

    /// The error says what failed and where: the prop, the value and the view.
    func testARejectedValueNamesThePropTheValueAndTheView() throws {
        XCTAssertThrowsError(try renderer.setProperty(id: box, name: "opacity", value: .text("x"))) { error in
            let message = error.localizedDescription

            XCTAssertTrue(message.contains("opacity"), message)
            XCTAssertTrue(message.contains(#""x""#), message)
            XCTAssertTrue(message.contains("box (1)"), message)
        }
    }

    func testAPropOnAnotherKindIsUnsupported() {
        XCTAssertThrowsError(try renderer.setProperty(id: box, name: "objectFit", value: .enumValue(1, "contain"))) { error in
            guard case KuitoRenderError.unsupportedProp(let prop, let view) = error else {
                return XCTFail("objectFit on a Box threw \(error), not unsupportedProp")
            }

            XCTAssertEqual(prop, "objectFit")
            XCTAssertTrue(view.contains("box (1)"), view)
        }
    }

    func testAPropNoTableHasIsUnsupported() {
        XCTAssertThrowsError(try renderer.setProperty(id: box, name: "bogus", value: .number(1))) { error in
            guard case KuitoRenderError.unsupportedProp("bogus", _) = error else {
                return XCTFail("bogus threw \(error), not unsupportedProp")
            }
        }
    }

    private func assertUnsupportedValue(id: UInt32, name: String, value: KuitoValue, line: UInt = #line) {
        XCTAssertThrowsError(try renderer.setProperty(id: id, name: name, value: value), "\(name): \(value)", line: line) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error, prop == name else {
                return XCTFail("\(name) threw \(error), not unsupportedValue", line: line)
            }
        }
    }
}
