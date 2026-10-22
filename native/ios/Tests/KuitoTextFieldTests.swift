import UIKit
import XCTest

/// A field's input props, as HTML's input attributes: `type` and `inputMode`
/// pick the keyboard, `autoCapitalize` and `spellCheck` follow the type unless
/// the app sets them, and `maxLength` cuts what the user types, not what the
/// app sets.
@MainActor
final class KuitoTextFieldTests: XCTestCase {
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1
    private var sent: [String] = []

    override func setUp() async throws {
        renderer = KuitoUIKitRenderer(container: UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640)))
        renderer.onEvent = { [unowned self] _, event, record in
            sent.append(describeEvent(event, record))

            return false
        }
        try renderer.createView(id: id, kind: "TextField", parent: 0, label: "field")
    }

    /// The selection as UTF-16 offsets, as the prop and its event give it.
    private func selected() throws -> [Int] {
        let field = try field
        let range = try XCTUnwrap(field.selectedTextRange)

        return [range.start, range.end].map { field.offset(from: field.beginningOfDocument, to: $0) }
    }

    /// The user moves the selection: UIKit tells the delegate.
    private func select(_ start: Int, _ end: Int) throws {
        let field = try field
        let from = try XCTUnwrap(field.position(from: field.beginningOfDocument, offset: start))
        let to = try XCTUnwrap(field.position(from: field.beginningOfDocument, offset: end))

        field.selectedTextRange = field.textRange(from: from, to: to)
        field.delegate?.textFieldDidChangeSelection?(field)
    }

    func testSelectionSelectsItsRange() throws {
        try set("text", .text("hello"))
        try set("selection", Structured.selection(start: 1, end: 3))

        XCTAssertEqual(try selected(), [1, 3])
    }

    func testSelectionStaysInsideTheText() throws {
        try set("text", .text("hello"))
        try set("selection", Structured.selection(start: 2, end: 99))

        XCTAssertEqual(try selected(), [2, 5])
    }

    func testUnsetSelectionPutsTheCaretAtTheEnd() throws {
        try set("text", .text("hello"))
        try set("selection", Structured.selection(start: 1, end: 3))
        try set("selection", .null)

        XCTAssertEqual(try selected(), [5, 5])
    }

    func testTheUsersSelectionIsSentOnceAsked() throws {
        try set("text", .text("hello"))
        try select(1, 2)

        XCTAssertEqual(sent, [], "nothing listens yet")

        try set("emitsSelection", .bool(true))
        try select(1, 4)

        XCTAssertEqual(sent, [describeEvent("selectionchange", KuitoTextSelection(start: 1, end: 4))])
    }

    func testABatchsSelectionAndTextSendNoSelectionChange() throws {
        try set("emitsSelection", .bool(true))
        try set("text", .text("hello"))
        try set("selection", Structured.selection(start: 0, end: 5))

        XCTAssertEqual(sent, [])
    }

    func testASelectionIsRejectedUnlessItIsARange() {
        for value in [KuitoValue.text("all"), Structured.selection(start: 3, end: 1), Structured.selection(start: -1, end: 1)] {
            XCTAssertThrowsError(try set("selection", value), "\(value)") { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "selection")
            }
        }
    }

    private var field: KuitoTextField {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoTextField) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    /// What the user typing `text` at the end of the field leaves in it.
    private func type(_ text: String) throws -> String? {
        let field = try field
        let end = NSRange(location: (field.text ?? "").utf16.count, length: 0)

        if field.delegate?.textField?(field, shouldChangeCharactersIn: end, replacementString: text) ?? true {
            field.text = (field.text ?? "") + text
        }

        return field.text
    }

    func testAPlainFieldIsProse() throws {
        let field = try field

        XCTAssertEqual(field.keyboardType, .default)
        XCTAssertFalse(field.isSecureTextEntry)
        XCTAssertEqual(field.autocapitalizationType, .sentences)
        XCTAssertEqual(field.autocorrectionType, .default)
    }

    func testAPasswordHidesItsText() throws {
        try set("type", .enumValue(1, "password"))

        XCTAssertTrue(try field.isSecureTextEntry)
        XCTAssertEqual(try field.autocapitalizationType, .none)
        XCTAssertEqual(try field.autocorrectionType, .no)
    }

    func testAnEmailTakesTheEmailKeyboardWithoutCapitals() throws {
        try set("type", .enumValue(2, "email"))

        XCTAssertEqual(try field.keyboardType, .emailAddress)
        XCTAssertEqual(try field.autocapitalizationType, .none)
        XCTAssertEqual(try field.spellCheckingType, .no)
    }

    func testInputModeOverridesTheTypesKeyboard() throws {
        try set("type", .enumValue(1, "password"))
        try set("inputMode", .enumValue(3, "numeric"))

        XCTAssertEqual(try field.keyboardType, .numberPad)
        XCTAssertTrue(try field.isSecureTextEntry)
    }

    func testInputModeNoneShowsNoKeyboard() throws {
        try set("inputMode", .enumValue(0, "none"))

        XCTAssertNotNil(try field.inputView)

        try set("inputMode", .null)

        XCTAssertNil(try field.inputView)
    }

    func testTheAppsCapitalizationAndSpellCheckWinOverTheTypes() throws {
        try set("type", .enumValue(2, "email"))
        try set("autoCapitalize", .enumValue(2, "words"))
        try set("spellCheck", .bool(true))

        XCTAssertEqual(try field.autocapitalizationType, .words)
        XCTAssertEqual(try field.autocorrectionType, .yes)
        XCTAssertEqual(try field.spellCheckingType, .yes)

        try set("autoCapitalize", .null)
        try set("spellCheck", .null)

        XCTAssertEqual(try field.autocapitalizationType, .none)
        XCTAssertEqual(try field.autocorrectionType, .no)
    }

    func testAutoCompleteNamesTheContentForAutofill() throws {
        try set("autoComplete", .enumValue(4, "one-time-code"))

        XCTAssertEqual(try field.textContentType, .oneTimeCode)

        try set("autoComplete", .enumValue(3, "new-password"))

        XCTAssertEqual(try field.textContentType, .newPassword)
    }

    func testMaxLengthCutsWhatTheUserTypes() throws {
        try set("maxLength", .number(4))

        XCTAssertEqual(try type("12"), "12")
        XCTAssertEqual(try type("345"), "1234")
        XCTAssertEqual(try type("5"), "1234")
    }

    func testMaxLengthCountsUTF16AndKeepsCharactersWhole() throws {
        try set("maxLength", .number(3))

        // Each flag is four UTF-16 units: the second does not fit, and is not cut in half.
        XCTAssertEqual(try type("a🇫🇷🇫🇷"), "a")
    }

    func testMaxLengthLeavesTheAppsTextWhole() throws {
        try set("maxLength", .number(2))
        try set("text", .text("hello"))

        XCTAssertEqual(try field.text, "hello")
    }

    func testMaxLengthRejectsWhatIsNotAWholeCount() {
        for limit in [Double.infinity, 1e20, -1, 2.5] {
            XCTAssertThrowsError(try set("maxLength", .number(limit)), "\(limit)") { error in
                guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

                XCTAssertEqual(prop, "maxLength")
            }
        }
    }

    func testASingleLineFieldTakesNoCountOfLines() {
        // lines={0} is falsy: the kernel keeps the single-line kind and sends it.
        XCTAssertThrowsError(try set("lines", Structured.lines(0))) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

            XCTAssertEqual(prop, "lines")
        }
        XCTAssertNoThrow(try set("lines", .null))
    }

    func testTypingWidensAFieldInARow() throws {
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let renderer = KuitoUIKitRenderer(container: container)

        try renderer.createView(id: 1, kind: "HStack", parent: 0, label: "row")
        try renderer.createView(id: 2, kind: "TextField", parent: 1, label: "field")
        try renderer.setProperty(id: 2, name: "backgroundColor", value: .color(0xffffffff))
        container.layoutIfNeeded()

        let field = try XCTUnwrap(renderer.nodes[2]?.view as? KuitoTextField)
        let width = field.frame.width

        field.text = "a longer text than before"
        field.sendActions(for: .editingChanged)
        container.layoutIfNeeded()

        XCTAssertGreaterThan(field.frame.width, width)
    }

    func testThePlaceholderSitsWhereTheTextDoes() throws {
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let renderer = KuitoUIKitRenderer(container: container)

        try renderer.createView(id: 1, kind: "TextField", parent: 0, label: "field")
        try renderer.setProperty(id: 1, name: "backgroundColor", value: .color(0xffffffff))
        try renderer.setProperty(id: 1, name: "padding", value: .number(12))
        try renderer.setProperty(id: 1, name: "placeholder", value: .text("Search"))
        container.layoutIfNeeded()

        let field = try XCTUnwrap(renderer.nodes[1]?.view as? KuitoTextField)
        let placeholder = field.placeholderRect(forBounds: field.bounds)
        let text = field.textRect(forBounds: field.bounds)
        let editing = field.editingRect(forBounds: field.bounds)

        XCTAssertEqual(field.padding, UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12))
        XCTAssertEqual(placeholder.minX, text.minX)
        XCTAssertEqual(placeholder.maxX, text.maxX)
        XCTAssertEqual(placeholder.midY, text.midY, accuracy: 0.5)
        XCTAssertEqual(text.minX, 12, "the padding, once")
        XCTAssertEqual(editing.minX, text.minX)
        XCTAssertEqual(editing.maxX, text.maxX)
    }

    func testAnUnknownTypeIsRejected() {
        XCTAssertThrowsError(try set("type", .enumValue(7, "color"))) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

            XCTAssertEqual(prop, "type")
        }
    }
}
