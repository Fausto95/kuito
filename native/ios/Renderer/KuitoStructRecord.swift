/// A structured prop's value as C++ laid it out (native/shared/Schema.h):
/// numbers and strings in its schema's order, which the generated value
/// types (KuitoPropValues.generated.swift) read back.
public struct KuitoStructRecord: Equatable {
    let numbers: [Double]
    let strings: [String]
}

/// Reads a record in its schema's order. C++ checked the value against the
/// same generated schema, so reading past the end is a bug in the generator.
struct KuitoStructReader {
    private let record: KuitoStructRecord
    private var nextNumber = 0
    private var nextString = 0

    init(_ record: KuitoStructRecord) {
        self.record = record
    }

    mutating func number() -> Double {
        defer { nextNumber += 1 }

        return record.numbers[nextNumber]
    }

    /// A count, an enum's index, or an `integer`, which C++ checked is whole.
    mutating func integer() -> Int {
        Int(number())
    }

    mutating func flag() -> Bool {
        number() != 0
    }

    /// 0xRRGGBBAA.
    mutating func color() -> UInt32 {
        UInt32(number())
    }

    mutating func string() -> String {
        defer { nextString += 1 }

        return record.strings[nextString]
    }
}
