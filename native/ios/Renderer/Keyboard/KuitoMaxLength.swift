import UIKit

/// HTML's `maxlength` for what the user enters: an edit that would pass the
/// limit keeps the whole characters that fit, counted in UTF-16 units as
/// HTML counts them. Text the app sets never comes through here. One per
/// field, single- or multi-line.
@MainActor
final class KuitoMaxLength: NSObject, UITextFieldDelegate {
    /// Whether the field held marked text at its last change.
    private var composing = false

    func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
        guard let field = textField as? KuitoTextField else { return true }

        return allows(field, replacing: range, with: string)
    }

    /// The field's delegate is this: it passes the selection on.
    func textFieldDidChangeSelection(_ textField: UITextField) {
        (textField as? KuitoTextField)?.selectionChanged()
    }

    /// Whether the edit goes ahead as the keyboard made it; a cut one is applied here instead.
    func allows(_ field: some KuitoTextInput, replacing range: NSRange, with string: String) -> Bool {
        // Marked text is a composition in progress (pinyin, kana): `changed` cuts it once it commits.
        guard let limit = field.maxLength, field.markedTextRange == nil else { return true }

        let text = field.value as NSString

        // An undo after a cut edit can name a range the text no longer has.
        guard NSMaxRange(range) <= text.length else { return false }

        let room = limit - (text.length - range.length)

        // Deleting is always allowed, even from app text past the limit.
        if string.isEmpty || string.utf16.count <= room { return true }

        let fitting = Self.prefix(of: string, fitting: room)

        guard !fitting.isEmpty else { return false }

        field.value = text.replacingCharacters(in: range, with: fitting)

        if let caret = field.position(from: field.beginningOfDocument, offset: range.location + fitting.utf16.count) {
            field.selectedTextRange = field.textRange(from: caret, to: caret)
        }

        field.edited()

        return false
    }

    /// After each change: a composition that committed past the limit keeps the characters that fit.
    func changed(_ field: some KuitoTextInput) {
        defer { composing = field.markedTextRange != nil }

        guard composing, field.markedTextRange == nil, let limit = field.maxLength, field.value.utf16.count > limit else { return }

        field.value = Self.prefix(of: field.value, fitting: limit)
    }

    /// The longest run of whole characters from the start of `string` within `room` UTF-16 units.
    static func prefix(of string: String, fitting room: Int) -> String {
        var units = 0

        return String(string.prefix { character in
            units += character.utf16.count

            return units <= room
        })
    }
}
