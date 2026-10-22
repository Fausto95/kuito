import UIKit
import XCTest

/// A field with `lines` is a UITextView: as tall as its lines (a number) or
/// as its text within a range of lines, growing as the user types; the
/// return key adds a line unless `submitBehavior` says it submits.
@MainActor
final class KuitoMultilineTextFieldTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private var sent: [String] = []
    private let id: UInt32 = 2

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: container)
        // Font sizes below are at the default text size, whatever the simulator's.
        renderer.textScale.update(.large)
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: 1, kind: "VStack", parent: 0, label: "screen")
        try renderer.createView(id: id, kind: "MultilineTextField", parent: 1, label: "notes")
    }

    private var field: KuitoTextView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoTextView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    /// The field's height after a layout pass, in lines of its font.
    private func lines() throws -> CGFloat {
        container.layoutIfNeeded()

        let field = try field

        return (field.frame.height / (field.font ?? .preferredFont(forTextStyle: .body)).lineHeight).rounded()
    }

    /// The user types `text` at the end, as the keyboard sends it.
    private func type(_ text: String) throws {
        let field = try field
        let end = NSRange(location: field.text.utf16.count, length: 0)

        if field.delegate?.textView?(field, shouldChangeTextIn: end, replacementText: text) ?? true {
            field.text += text
            field.delegate?.textViewDidChange?(field)
        }
    }

    func testAFixedCountOfLinesSetsItsHeight() throws {
        try set("lines", Structured.lines(3))

        XCTAssertEqual(try lines(), 3)

        try set("text", .text("one\ntwo\nthree\nfour\nfive"))

        XCTAssertEqual(try lines(), 3, "more text scrolls inside")
    }

    func testARangeOfLinesFollowsTheText() throws {
        try set("lines", Structured.lines(min: 1, max: 3))

        XCTAssertEqual(try lines(), 1)

        try set("text", .text("one\ntwo"))

        XCTAssertEqual(try lines(), 2)

        try set("text", .text("one\ntwo\nthree\nfour\nfive"))

        XCTAssertEqual(try lines(), 3)
    }

    func testTypingANewLineGrowsTheField() throws {
        try set("lines", Structured.lines(min: 1, max: 4))

        XCTAssertEqual(try lines(), 1)

        try type("hello")
        try type("\n")
        try type("world")

        XCTAssertEqual(try lines(), 2)
        XCTAssertEqual(sent.filter { $0.hasPrefix("change") }.last, describeEvent("change", KuitoTextPayload(text: "hello\nworld")))
    }

    func testReturnAddsALineByDefault() throws {
        try set("lines", Structured.lines(3))
        try type("a")
        try type("\n")

        XCTAssertEqual(try field.text, "a\n")
        XCTAssertFalse(sent.contains { $0.hasPrefix("submit") })
    }

    func testSubmitBehaviorSubmitMakesReturnSubmit() throws {
        try set("lines", Structured.lines(3))
        try set("submitBehavior", .enumValue(0, "submit"))
        try type("a")
        try type("\n")

        XCTAssertEqual(try field.text, "a")
        XCTAssertEqual(sent.filter { $0.hasPrefix("submit") }, [describeEvent("submit", KuitoTextPayload(text: "a"))])
    }

    func testItTakesAFieldsProps() throws {
        try set("text", .text("Draft"))
        try set("placeholder", .text("Notes"))
        try set("color", .color(0xff0000ff))
        try set("fontSize", .number(20))
        try set("enterKeyHint", .enumValue(1, "done"))
        try set("type", .enumValue(2, "email"))
        try set("disabled", .bool(true))

        let field = try field

        XCTAssertEqual(field.text, "Draft")
        XCTAssertEqual(field.placeholder, "Notes")
        XCTAssertEqual(field.textColor, UIColor(red: 1, green: 0, blue: 0, alpha: 1))
        XCTAssertEqual(field.font?.pointSize, 20)
        XCTAssertEqual(field.returnKeyType, .done)
        XCTAssertEqual(field.keyboardType, .emailAddress)
        XCTAssertFalse(field.isEditable)
    }

    func testThePlaceholderShowsOnlyWhileEmpty() throws {
        try set("placeholder", .text("Notes"))

        XCTAssertTrue(try field.showsPlaceholder)

        try type("a")

        XCTAssertFalse(try field.showsPlaceholder)
    }

    func testMaxLengthCutsWhatTheUserTypes() throws {
        try set("maxLength", .number(4))
        try type("12")
        try type("345")

        XCTAssertEqual(try field.text, "1234")
    }

    func testChangingLinesOnAShownFieldResizesIt() throws {
        try set("lines", Structured.lines(1))

        XCTAssertEqual(try lines(), 1)

        try set("lines", Structured.lines(3))

        XCTAssertEqual(try lines(), 3)
    }

    func testTallerGlyphsThanTheFontsLineShowWhole() throws {
        try set("lines", Structured.lines(min: 1, max: 4))
        try set("text", .text("😀😀\n😀😀"))
        container.layoutIfNeeded()

        let field = try field

        field.layoutManager.ensureLayout(for: field.textContainer)

        XCTAssertGreaterThanOrEqual(field.frame.height, ceil(field.layoutManager.usedRect(for: field.textContainer).height))
    }

    func testItKeepsOffTheScrollViewDefaults() throws {
        let field = try field

        XCTAssertFalse(field.scrollsToTop, "the status bar tap scrolls the screen, not a field")
        XCTAssertEqual(field.contentInsetAdjustmentBehavior, .never)
    }

    func testDisabledTakesNoSelectionAndKeepsItsFont() throws {
        try set("fontSize", .number(20))
        try set("disabled", .bool(true))

        let field = try field

        XCTAssertFalse(field.isSelectable)
        XCTAssertEqual(field.font?.pointSize, 20)
    }

    func testAMultiLineFieldTakesOnlyTextTypes() throws {
        try set("type", .enumValue(6, "search"))

        for (index, type) in [(1, "password"), (3, "number"), (4, "tel")] {
            XCTAssertThrowsError(try set("type", .enumValue(Int32(index), type)), type) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "type")
            }
        }
    }

    func testAMultiLineFieldTakesOnlyTextKeyboards() throws {
        try set("inputMode", .enumValue(7, "url"))

        for (index, mode) in [(2, "decimal"), (3, "numeric"), (4, "tel")] {
            XCTAssertThrowsError(try set("inputMode", .enumValue(Int32(index), mode)), mode) { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "inputMode")
            }
        }
    }

    func testSelectionSelectsItsRangeAndTheUsersIsSent() throws {
        try set("text", .text("one\ntwo"))
        try set("emitsSelection", .bool(true))
        try set("selection", Structured.selection(start: 4, end: 7))

        let field = try field

        XCTAssertEqual(field.selectedRange, NSRange(location: 4, length: 3))
        XCTAssertEqual(sent, [], "the batch's selection is not the user's")

        field.selectedRange = NSRange(location: 1, length: 0)
        field.delegate?.textViewDidChangeSelection?(field)

        XCTAssertEqual(sent, [describeEvent("selectionchange", KuitoTextSelection(start: 1, end: 1))])
    }

    func testLinesRejectsAnythingButACountOrARange() {
        for value in [KuitoValue.text("three"), .number(3), Structured.lines(0), Structured.lines(min: 3, max: 1), Structured.lines(min: 0, max: nil)] {
            XCTAssertThrowsError(try set("lines", value), "\(value)") { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "lines")
            }
        }
    }
}
