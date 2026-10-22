import UIKit

/// What a record of the host batch does; native/shared/Mutation.h's `Op`.
public enum KuitoMutationOp: UInt8 {
    case create = 1, remove, move, flatten, prop, command, ui, uiScript, uiKernel, uiBundle
}

/// A prop's value as the host batch typed it, by the prop's manifest kind
/// (native/shared/Wire.h): a color arrives parsed, an enum as its index.
public enum KuitoValue: Equatable {
    case null
    case number(Double)
    case bool(Bool)
    case text(String)
    /// 0xRRGGBBAA.
    case color(UInt32)
    /// Its index among the prop's manifest values, and that value.
    case enumValue(Int32, String)
    case json(String)
    /// A list's keys as edits to the keys it has (docs/lists.md#keys).
    case keys([KuitoKeyEdit])
    /// A structured prop's value, checked against its schema and laid out
    /// for its generated type (KuitoPropValues).
    case structure(KuitoStructRecord)

    /// A length in points; 0 for anything else.
    var points: CGFloat {
        if case .number(let number) = self { return CGFloat(number) }

        return 0
    }

    /// The value as setters that still parse it take it: scalars, and text
    /// for colors, enums and JSON.
    var untyped: Any? {
        switch self {
        case .null: nil
        case .number(let number): NSNumber(value: number)
        case .bool(let flag): flag
        case .text(let text), .json(let text), .enumValue(_, let text): text
        case .color(let color): String(format: "#%08x", color)
        case .keys, .structure: nil
        }
    }
}

/// One edit of a list's keys, applied to the keys the edits before it left:
/// native/shared/Mutation.h's `KeyEdit`.
public struct KuitoKeyEdit: Equatable {
    public enum Op: UInt8 {
        case insert, remove, move
    }

    public let op: Op
    /// Where the key lands; for a removal, where it is. A move's index counts
    /// once the key has left its place.
    public let index: Int
    public let key: String

    public init(_ op: Op, _ key: String, at index: Int) {
        self.op = op
        self.key = key
        self.index = index
    }
}

/// The prop key of a record that names its prop.
let kuitoNamedProp: UInt16 = 0xffff

extension KuitoMutationRecord {
    var operation: KuitoMutationOp? { KuitoMutationOp(rawValue: op) }

    var textValue: String { Self.string(text, textLength) }
    var nameValue: String { Self.string(name, nameLength) }

    /// The prop a Prop record writes, by name.
    var propName: String {
        key == kuitoNamedProp ? nameValue : KuitoProps.byKey[Int(key)]
    }

    var value: KuitoValue {
        switch kind {
        case 1: .number(number)
        case 2: .bool(number != 0)
        case 3: .text(textValue)
        case 4: .color(color)
        case 5: .enumValue(enumValue, KuitoProps.valuesByKey[Int(key)][Int(enumValue)])
        case 6: .json(textValue)
        case 7: .keys(keyEdits)
        case 8: .structure(structRecord)
        default: .null
        }
    }

    /// native/shared/Wire.h checked each edit's op.
    private var keyEdits: [KuitoKeyEdit] {
        UnsafeBufferPointer(start: edits, count: editCount).compactMap { edit in
            KuitoKeyEdit.Op(rawValue: edit.op).map { KuitoKeyEdit($0, Self.string(edit.key, edit.keyLength), at: Int(edit.index)) }
        }
    }

    /// Copied: the batch's storage goes when the batch does.
    private var structRecord: KuitoStructRecord {
        KuitoStructRecord(
            numbers: Array(UnsafeBufferPointer(start: numbers, count: numberCount)),
            strings: UnsafeBufferPointer(start: strings, count: stringCount).map { Self.string($0.text, $0.length) }
        )
    }

    private static func string(_ bytes: UnsafePointer<CChar>?, _ length: Int) -> String {
        guard let bytes else { return "" }

        return bytes.withMemoryRebound(to: UInt8.self, capacity: length) {
            String(decoding: UnsafeBufferPointer(start: $0, count: length), as: UTF8.self)
        }
    }
}
