import UIKit

/// What a field takes and how the keyboard helps: HTML's input type,
/// inputmode, autocomplete, autocapitalize, maxlength and spellcheck.
@MainActor
enum KuitoInputProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "type": field { context, field, value in
            let type = try context.keyword(value)

            guard KuitoInputTraits.types[type] != nil else { throw context.unsupportedValue(value, "expects one of its values") }

            // UITextView shows a password's text, and Android's number and phone keyboards are single-line.
            guard !(field is KuitoTextView) || KuitoInputTraits.multilineTypes.contains(type) else {
                throw context.unsupportedValue(value, "a field with lines takes type text, email, url or search")
            }

            field.traits.type = type
        },
        "inputMode": field { context, field, value in
            let mode = try keyword(context, value, in: KuitoInputTraits.modes)

            guard !(field is KuitoTextView) || mode.map(KuitoInputTraits.multilineModes.contains) ?? true else {
                throw context.unsupportedValue(value, "a field with lines takes inputMode none, text, search, email or url")
            }

            field.traits.mode = mode
        },
        "autoComplete": field { context, field, value in
            field.traits.autoComplete = try keyword(context, value, in: KuitoInputTraits.contentTypes)
        },
        "autoCapitalize": field { context, field, value in
            field.traits.capitalize = try keyword(context, value, in: KuitoInputTraits.capitalizations)
        },
        "maxLength": field { context, field, value in
            let limit = value == .null ? nil : try context.number(value)

            let whole = limit.flatMap { Int(exactly: $0) }

            guard limit == nil || (whole ?? -1) >= 0 else { throw context.unsupportedValue(value, "expects a whole number of at least 0") }

            field.maxLength = whole
        },
        "spellCheck": field { context, field, value in
            field.traits.spellCheck = value == .null ? nil : try context.flag(value)
        },
        "emitsSelection": field { context, field, value in field.emitsSelection = try context.flag(value) },
        "formats": field { context, field, value in field.formats = try context.flag(value) },
        "selection": field { context, field, value in
            guard value != .null else {
                field.select(start: field.value.utf16.count, end: field.value.utf16.count)

                return
            }

            let range = try context.structure(value, KuitoPropValues.selection)

            guard range.start >= 0, range.start <= range.end else {
                throw context.unsupportedValue(value, "expects { start, end }, offsets of at least 0 with start <= end")
            }

            field.select(start: range.start, end: range.end)
        },
        // `lines` makes the kernel create the multi-line kind: a single-line field is only ever sent null.
        "lines": { context, value in
            guard let view = context.view as? KuitoTextView else {
                guard context.view is KuitoTextField else { throw context.unsupportedProp() }
                // Only lines={0}, falsy, keeps the single-line kind and still arrives.
                guard value == .null else { throw context.unsupportedValue(value, "expects a whole count of at least 1, or { min, max }") }

                return
            }

            view.lines = try lines(context, value)
        },
    ]

    /// A count of lines, or a `{ min, max }` range; null is 1 to no limit.
    private static func lines(_ context: KuitoPropertyContext, _ value: KuitoValue) throws -> KuitoLines {
        guard value != .null else { return KuitoLines() }

        let atLeastOne = { (lines: Int) throws -> Int in
            guard lines >= 1 else { throw context.unsupportedValue(value, "expects a whole count of at least 1, or { min, max }") }

            return lines
        }

        switch try context.structure(value, KuitoPropValues.lines) {
        case .count(let count):
            let lines = try atLeastOne(count)

            return KuitoLines(min: lines, max: lines)
        case .range(let range):
            let min = try range.min.map(atLeastOne) ?? 1
            let max = try range.max.map(atLeastOne)

            guard max.map({ $0 >= min }) ?? true else { throw context.unsupportedValue(value, "expects min <= max") }

            return KuitoLines(min: min, max: max)
        }
    }

    /// Null, or one of the table's keys.
    private static func keyword<Value>(_ context: KuitoPropertyContext, _ value: KuitoValue, in table: [String: Value]) throws -> String? {
        guard value != .null else { return nil }

        let name = try context.keyword(value)

        guard table[name] != nil else { throw context.unsupportedValue(value, "expects one of its values") }

        return name
    }

    private static func field(
        _ apply: @escaping @MainActor (KuitoPropertyContext, KuitoTextInput, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let field = context.view as? KuitoTextInput else { throw context.unsupportedProp() }

            try apply(context, field, value)
        }
    }
}
