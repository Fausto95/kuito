import Foundation

/// An argument, or a part of one, as it crossed the host boundary: decoded
/// into the type the spec declares, or an `ERR_ARGUMENT` naming where it
/// failed. The kernel checked it against the same spec, so a failure here is
/// a spec and a stub that disagree.
struct KuitoArgument {
    let raw: Any
    /// Names the value in errors: `Battery.configure argument 1.mode`.
    let path: String

    init(_ raw: Any, path: String) {
        self.raw = raw
        self.path = path
    }

    func number() throws -> Double {
        guard let number = raw as? NSNumber, !KuitoArgument.isBoolean(number) else { throw mismatch("a number") }

        return number.doubleValue
    }

    func string() throws -> String {
        guard let string = raw as? String else { throw mismatch("a string") }

        return string
    }

    func bool() throws -> Bool {
        guard let number = raw as? NSNumber, KuitoArgument.isBoolean(number) else { throw mismatch("true or false") }

        return number.boolValue
    }

    /// An ArrayBuffer's bytes, shared with it: see docs/native-modules.md#bytes.
    func bytes() throws -> Data {
        guard let data = raw as? Data else { throw mismatch("an ArrayBuffer") }

        return data
    }

    /// Null and absent decode as nil.
    func optional<T>(_ decode: (KuitoArgument) throws -> T) throws -> T? {
        raw is NSNull ? nil : try decode(self)
    }

    func array<T>(_ decode: (KuitoArgument) throws -> T) throws -> [T] {
        guard let items = raw as? [Any] else { throw mismatch("an array") }

        return try items.enumerated().map { index, item in try decode(KuitoArgument(item, path: "\(path)[\(index)]")) }
    }

    func record<T>(_ decode: (KuitoArgument) throws -> T) throws -> [String: T] {
        guard let fields = raw as? [String: Any] else { throw mismatch("an object") }

        return try fields.reduce(into: [:]) { record, field in
            record[field.key] = try decode(KuitoArgument(field.value, path: "\(path).\(field.key)"))
        }
    }

    func enumeration<E: RawRepresentable>(_ type: E.Type) throws -> E where E.RawValue == String {
        guard let value = E(rawValue: try string()) else { throw mismatch("one of \(E.self)'s values") }

        return value
    }

    func decode<T: KuitoDecodable>(_ type: T.Type) throws -> T {
        try T.kuitoDecode(self)
    }

    /// A struct's field: structs cross as their fields in the order the spec
    /// declares them (src/cli/link-signature.ts), an absent one null.
    func field(_ index: Int, _ name: String) throws -> KuitoArgument {
        guard let fields = raw as? [Any] else { throw mismatch("an object") }

        return KuitoArgument(index < fields.count ? fields[index] : NSNull(), path: "\(path).\(name)")
    }

    /// The value as JSON data: NSNull, NSNumber, String, arrays and dictionaries of them.
    func json() -> Any {
        raw
    }

    private func mismatch(_ expected: String) -> KuitoModuleError {
        KuitoModuleError(KuitoErrorCode.argument, "\(path) must be \(expected)")
    }

    static func isBoolean(_ number: NSNumber) -> Bool {
        CFGetTypeID(number) == CFBooleanGetTypeID()
    }
}

/// A spec's record, made from the value that crossed: generated for each.
protocol KuitoDecodable {
    static func kuitoDecode(_ value: KuitoArgument) throws -> Self
}

/// A spec's record, generated for each: as JSON data, for a module to keep
/// or send as `Json`, and as its fields in declared order, to cross back.
protocol KuitoEncodable {
    func kuitoEncoded() -> Any
    func kuitoFields() -> [Any]
}
