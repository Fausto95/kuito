import UIKit

/// A field the user types into: single-line (KuitoTextField, a
/// UITextField) or multi-line (KuitoTextView, a UITextView). The text,
/// control, keyboard and input props set it through this, so both kinds take
/// the same props.
@MainActor
protocol KuitoTextInput: UIView, UITextInput, KuitoPaddedView {
    /// The text, never nil. Setting it is the app's write: no change event.
    var value: String { get set }
    var font: UIFont? { get set }
    var textColor: UIColor? { get set }
    var placeholder: String? { get set }
    var placeholderColor: UIColor? { get set }
    var disabled: Bool { get set }
    /// nil is the kind's default: `blurAndSubmit` single-line, `newline` multi-line.
    var submitBehavior: String? { get set }
    var autoFocus: Bool { get set }
    var traits: KuitoInputTraits { get set }
    /// HTML's `maxlength`, for what the user enters (KuitoMaxLength).
    var maxLength: Int? { get set }
    var keyboardType: UIKeyboardType { get set }
    var isSecureTextEntry: Bool { get set }
    var autocapitalizationType: UITextAutocapitalizationType { get set }
    var autocorrectionType: UITextAutocorrectionType { get set }
    var spellCheckingType: UITextSpellCheckingType { get set }
    var textContentType: UITextContentType! { get set }
    var returnKeyType: UIReturnKeyType { get set }
    var inputView: UIView? { get set }
    /// Sends the field's events; true when the UI thread's kernel took one (KuitoEventEmitter).
    var emit: ((String, (any KuitoEventPayload)?) -> Bool)? { get set }
    /// Whether the user's selection is sent: something listens to it (`emitsSelection`).
    var emitsSelection: Bool { get set }
    /// The selection the app last knows of, its own or the user's: an unchanged one sends nothing.
    var knownSelection: [Int]? { get set }
    /// A format answers the user's edits (`formats`, docs/keyboard.md#formatting).
    var formats: Bool { get set }
    /// The user's text since a composition began, which its format has yet to see.
    var unformatted: Bool { get set }
    /// Reports a change made for the user outside the keyboard's own path: a paste cut to fit.
    func edited()
}

extension KuitoTextInput {
    /// The selection as UTF-16 offsets, `[start, end]`, as HTML counts them.
    var selectedOffsets: [Int]? {
        selectedTextRange.map { [$0.start, $0.end].map { offset(from: beginningOfDocument, to: $0) } }
    }

    /// The app's selection, kept inside the text. It is not the user's: it sends nothing.
    func select(start: Int, end: Int) {
        let length = value.utf16.count

        guard let from = position(from: beginningOfDocument, offset: Swift.min(start, length)),
              let to = position(from: beginningOfDocument, offset: Swift.min(end, length))
        else { return }

        quietly { selectedTextRange = textRange(from: from, to: to) }
    }

    /// The app's text, with the caret after it as HTML puts it. The text it
    /// shows already moves nothing, as HTML's `value` setter does not.
    func show(_ text: String) {
        guard text != value else { return }

        quietly {
            value = text
            select(start: text.utf16.count, end: text.utf16.count)
        }
    }

    /// A change of the app's: UIKit may report the selection it moves, which is not the user's.
    private func quietly(_ change: () -> Void) {
        let emits = emitsSelection

        emitsSelection = false
        defer {
            emitsSelection = emits
            knownSelection = selectedOffsets
        }
        change()
    }

    /// The user changed the text. A field with a format sends the edit for a
    /// kernel to answer, and reports the change once the UI thread's has,
    /// before the frame; one the JS thread answers, it reports itself. A
    /// composition in progress (pinyin, kana) reports its text as typed and
    /// formats once it commits.
    func userEdited() {
        guard formats, markedTextRange == nil else {
            unformatted = formats
            _ = emit?("change", KuitoTextPayload(text: value))

            return
        }

        formatEdit()
    }

    /// The field lost the focus with its composition's text unformatted:
    /// it formats now. UIKit reports a committed composition as an edit.
    func compositionEnded() {
        if unformatted, markedTextRange == nil { formatEdit() }
    }

    private func formatEdit() {
        guard let before = selectedOffsets, let start = before.first, let end = before.last else { return }

        unformatted = false

        guard emit?("format", KuitoTextEdit(text: value, start: Double(start), end: Double(end))) == true else { return }

        _ = emit?("change", KuitoTextPayload(text: value))

        // The format's caret is the user's: their edit moved it.
        guard emitsSelection, let after = selectedOffsets, after != before, let from = after.first, let to = after.last else { return }

        _ = emit?("selectionchange", KuitoTextSelection(start: Double(from), end: Double(to)))
    }

    /// UIKit says the selection moved: the user's move is sent once, while something listens.
    func selectionChanged() {
        guard let selection = selectedOffsets, selection != knownSelection else { return }

        knownSelection = selection

        if emitsSelection, let start = selection.first, let end = selection.last {
            _ = emit?("selectionchange", KuitoTextSelection(start: Double(start), end: Double(end)))
        }
    }
}
