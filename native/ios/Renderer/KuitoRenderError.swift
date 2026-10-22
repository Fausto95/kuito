import Foundation

/// Every error the renderer throws. The shell discards the batch and reports
/// it (docs/logbox.md); Android's KuitoRenderError has the same four cases.
public enum KuitoRenderError: LocalizedError {
    /// The view takes no such prop or command: no table has it, or it is
    /// another kind's.
    case unsupportedProp(prop: String, view: String)
    /// The prop or command takes no such value; `reason` says what it takes.
    case unsupportedValue(prop: String, value: String, view: String, reason: String)
    /// The mutation makes a tree the renderer cannot show: a number in use, an
    /// unknown kind, a page outside its container.
    case invalidTree(String)
    /// No view has the number.
    case missingView(String)

    public var errorDescription: String? {
        switch self {
        case .unsupportedProp(let prop, let view): "\(view) takes no \(prop)"
        case .unsupportedValue(let prop, let value, let view, let reason): "\(prop) on \(view) takes no \(value): \(reason)"
        case .invalidTree(let reason): "Invalid tree: \(reason)"
        case .missingView(let view): "No view \(view)"
        }
    }

    /// Why a value was rejected, thrown below a setter or a command that has
    /// no context: the renderer turns it into `unsupportedValue`.
    struct Rejection: Error {
        let reason: String

        init(_ reason: String) { self.reason = reason }
    }
}

extension KuitoValue {
    /// The value as an error quotes it.
    var quoted: String {
        switch self {
        case .null: "null"
        case .number(let number): String(describing: number)
        case .bool(let flag): String(flag)
        case .color(let rgba): String(format: "#%08x", rgba)
        case .text(let text), .json(let text), .enumValue(_, let text): "\"\(text)\""
        case .keys(let edits): "\(edits.count) key edits"
        case .structure(let record): "record(numbers: \(record.numbers), strings: \(record.strings))"
        }
    }
}
