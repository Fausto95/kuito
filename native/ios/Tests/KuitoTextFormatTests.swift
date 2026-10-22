import UIKit
import XCTest

/// A field with a format (docs/keyboard.md#formatting): the user's edit goes
/// to the format first, as a `format` event; when the UI thread answers it,
/// by setting the text and the caret before the event returns, the field
/// then reports the formatted text as its change. A composition reports its
/// text as typed and formats once it commits. These tests answer as the UI
/// thread's kernel does, through the renderer's own setters.
@MainActor
final class KuitoTextFormatTests: XCTestCase {
    private var window: UIWindow!
    private var renderer: KuitoUIKitRenderer!
    private var sent: [String] = []
    /// What the UI thread makes of an edit: the text and the caret. nil leaves it to the JS thread.
    private var answer: ((String) -> (String, Int))? = { text in
        let digits = text.filter(\.isNumber)
        let grouped = stride(from: 0, to: digits.count, by: 4).map { start in
            String(digits.dropFirst(start).prefix(4))
        }.joined(separator: " ")

        return (grouped, grouped.utf16.count)
    }

    override func setUp() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene, "the test host's scene")
        let host = UIViewController()

        window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.makeKeyAndVisible()
        renderer = KuitoUIKitRenderer(container: host.view)
        renderer.onEvent = { [unowned self] id, event, record in
            guard event == "format" else {
                sent.append(describeEvent(event, record))

                return false
            }

            sent.append("format \(record.strings.first ?? "") \(record.numbers.map { Int($0) })")

            guard let answer, let text = record.strings.first else { return false }

            let (shown, caret) = answer(text)

            try? renderer.setProperty(id: id, name: "text", value: .text(shown))
            try? renderer.setProperty(id: id, name: "selection", value: Structured.selection(start: caret, end: caret))

            return true
        }
        try renderer.createView(id: 1, kind: "VStack", parent: 0, label: "screen")
        try renderer.createView(id: id, kind: "TextField", parent: 1, label: "card")
        try renderer.setProperty(id: id, name: "formats", value: .bool(true))
        try field.becomeFirstResponder()
        sent.removeAll()
    }

    override func tearDown() async throws {
        window.isHidden = true
        window = nil
    }

    private let id: UInt32 = 2

    private var field: KuitoTextField {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoTextField) }
    }

    private func selected() throws -> [Int] {
        try XCTUnwrap(try field.selectedOffsets)
    }

    private func change(_ text: String) -> String {
        describeEvent("change", KuitoTextPayload(text: text))
    }

    func testAnEditIsFormattedBeforeItsChangeIsSent() throws {
        for digit in "42424" { try field.insertText(String(digit)) }

        XCTAssertEqual(try field.text, "4242 4")
        XCTAssertEqual(try selected(), [6, 6])
        XCTAssertEqual(Array(sent.suffix(2)), ["format 42424 [5, 5]", change("4242 4")])
        XCTAssertFalse(sent.contains(change("42424")), "the unformatted text is never reported")
    }

    func testAnEditTheUIThreadLeavesIsTheJSThreadsToReport() throws {
        answer = nil

        try field.insertText("4")

        XCTAssertEqual(sent, ["format 4 [1, 1]"])
    }

    func testACompositionReportsItsTextAndFormatsOnceItCommits() throws {
        answer = { text in (text.uppercased(), text.utf16.count) }

        try field.setMarkedText("ni", selectedRange: NSRange(location: 2, length: 0))

        XCTAssertEqual(sent, [change("ni")], "mid-composition: no format")

        try field.unmarkText()

        XCTAssertEqual(try field.text, "NI")
        XCTAssertEqual(sent.filter { $0.hasPrefix("format") }, ["format ni [2, 2]"])
        XCTAssertEqual(sent.last, change("NI"))
    }

    func testTheFormatsCaretIsTheUsersSelection() throws {
        try renderer.setProperty(id: id, name: "emitsSelection", value: .bool(true))

        for digit in "42424" { try field.insertText(String(digit)) }

        XCTAssertEqual(sent.last, describeEvent("selectionchange", KuitoTextSelection(start: 6, end: 6)))
    }

    func testTheTextAFieldShowsAlreadyLeavesItsCaret() throws {
        try renderer.setProperty(id: id, name: "text", value: .text("4242 4242"))
        try renderer.setProperty(id: id, name: "selection", value: Structured.selection(start: 2, end: 2))
        try renderer.setProperty(id: id, name: "text", value: .text("4242 4242"))

        XCTAssertEqual(try selected(), [2, 2])
    }

    func testAMultiLineFieldFormatsAsASingleLineOneDoes() throws {
        answer = { text in (text.uppercased(), text.utf16.count) }
        try renderer.createView(id: 3, kind: "MultilineTextField", parent: 1, label: "notes")
        try renderer.setProperty(id: 3, name: "formats", value: .bool(true))

        let notes = try XCTUnwrap(renderer.nodes[3]?.view as? KuitoTextView)

        notes.becomeFirstResponder()
        sent.removeAll()
        notes.insertText("a")

        XCTAssertEqual(notes.text, "A")
        XCTAssertEqual(sent, ["format a [1, 1]", change("A")])
    }
}
