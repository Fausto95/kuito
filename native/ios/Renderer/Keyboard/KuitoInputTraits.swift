import UIKit

/// A field's HTML input attributes, and the UIKit traits they make together:
/// the keyboard comes from `inputMode` or else `type`, and capitalization and
/// spell checking follow the type unless the app sets them.
@MainActor
struct KuitoInputTraits: Equatable {
    var type = "text"
    var mode: String?
    var capitalize: String?
    var spellCheck: Bool?
    var autoComplete: String?

    static let types: [String: UIKeyboardType] = [
        "text": .default, "password": .default, "email": .emailAddress, "number": .numbersAndPunctuation,
        "tel": .phonePad, "url": .URL, "search": .webSearch,
    ]
    /// `none` keeps the type's keyboard type: the field shows no keyboard at all.
    static let modes: [String: UIKeyboardType?] = [
        "none": nil, "text": .default, "decimal": .decimalPad, "numeric": .numberPad, "tel": .phonePad,
        "search": .webSearch, "email": .emailAddress, "url": .URL,
    ]
    static let capitalizations: [String: UITextAutocapitalizationType] = [
        "none": .none, "sentences": .sentences, "words": .words, "characters": .allCharacters,
    ]
    /// iOS has no switch for `off`: it only drops the content type.
    static let contentTypes: [String: UITextContentType?] = [
        "off": nil, "username": .username, "current-password": .password, "new-password": .newPassword,
        "one-time-code": .oneTimeCode, "email": .emailAddress, "name": .name, "given-name": .givenName,
        "family-name": .familyName, "tel": .telephoneNumber, "street-address": .fullStreetAddress,
        "postal-code": .postalCode, "country-name": .countryName, "cc-number": .creditCardNumber,
    ]
    /// The types a field with `lines` takes: text keyboards that can enter a new line.
    static let multilineTypes: Set<String> = ["text", "email", "url", "search"]
    static let multilineModes: Set<String> = ["none", "text", "search", "email", "url"]
    /// Types whose text is prose: capitalized and spell-checked unless the app says otherwise.
    private static let prose: Set<String> = ["text", "search"]

    func apply(to field: some KuitoTextInput) {
        let prose = Self.prose.contains(type)
        let checks = spellCheck ?? (prose ? nil : false)

        field.keyboardType = mode.flatMap { Self.modes[$0] ?? nil } ?? Self.types[type] ?? .default
        field.isSecureTextEntry = type == "password"
        field.autocapitalizationType = capitalize.flatMap { Self.capitalizations[$0] } ?? (prose ? .sentences : .none)
        field.spellCheckingType = checks.map { $0 ? .yes : .no } ?? .default
        field.autocorrectionType = checks.map { $0 ? .yes : .no } ?? .default
        field.textContentType = autoComplete.flatMap { Self.contentTypes[$0] ?? nil }
        field.inputView = mode == "none" ? UIView() : nil
        field.reloadInputViews()
    }
}
