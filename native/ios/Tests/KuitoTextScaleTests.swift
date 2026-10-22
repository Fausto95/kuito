import UIKit
import XCTest

/// Text follows the user's Dynamic Type size through UIFontMetrics, at most
/// `maxFontScale` times its `fontSize`, and lays out again when it changes.
@MainActor
final class KuitoTextScaleTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        renderer.textScale.update(.large)
        try renderer.createView(id: 1, kind: "Text", parent: 0, label: "label")
        try renderer.setProperty(id: 1, name: "text", value: .text("Hello"))
        try renderer.setProperty(id: 1, name: "fontSize", value: .number(20))
        container.layoutIfNeeded()
    }

    private func pointSize(_ id: UInt32 = 1) throws -> CGFloat {
        let view = try XCTUnwrap(renderer.nodes[id]?.view)

        switch view {
        case let label as UILabel:
            let font = label.attributedText?.attribute(.font, at: 0, effectiveRange: nil) as? UIFont

            return try XCTUnwrap(font).pointSize
        case let button as UIButton:
            return try XCTUnwrap(button.titleLabel?.font).pointSize
        case let field as KuitoTextInput:
            return try XCTUnwrap(field.font).pointSize
        default:
            throw XCTSkip("\(view) shows no text")
        }
    }

    func testAtTheDefaultSizeTextIsItsFontSize() throws {
        XCTAssertEqual(try pointSize(), 20)
    }

    func testALargerTextSizeEnlargesTextAndLaysItOutAgain() throws {
        renderer.textScale.update(.accessibilityExtraExtraExtraLarge)

        XCTAssertGreaterThan(try pointSize(), 20)
        XCTAssertTrue(try XCTUnwrap(renderer.nodes[1]).layout.dirty)
    }

    func testMaxFontScaleCapsTheGrowth() throws {
        try renderer.setProperty(id: 1, name: "maxFontScale", value: .number(1.5))
        renderer.textScale.update(.accessibilityExtraExtraExtraLarge)

        XCTAssertEqual(try pointSize(), 30, accuracy: 0.01)
    }

    func testAMaxFontScaleOfOneKeepsTheFontSize() throws {
        try renderer.setProperty(id: 1, name: "maxFontScale", value: .number(1))
        renderer.textScale.update(.accessibilityExtraExtraExtraLarge)

        XCTAssertEqual(try pointSize(), 20)
    }

    func testAMaxFontScaleBelowOneIsAnError() {
        XCTAssertThrowsError(try renderer.setProperty(id: 1, name: "maxFontScale", value: .number(0.5))) { error in
            guard case KuitoRenderError.unsupportedValue("maxFontScale", _, _, _) = error else {
                return XCTFail("\(error)")
            }
        }
    }

    func testFieldsAndButtonsScaleToo() throws {
        try renderer.createView(id: 2, kind: "TextField", parent: 0, label: "field")
        try renderer.createView(id: 3, kind: "Button", parent: 0, label: "button")
        try renderer.setProperty(id: 3, name: "text", value: .text("Go"))

        let (field, button) = (try pointSize(2), try pointSize(3))

        renderer.textScale.update(.accessibilityExtraExtraExtraLarge)

        XCTAssertGreaterThan(try pointSize(2), field)
        XCTAssertGreaterThan(try pointSize(3), button)
    }
}
