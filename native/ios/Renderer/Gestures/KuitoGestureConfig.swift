import CoreGraphics

/// A gesture's `config`, checked against the keys its type takes: RNGH's
/// native config keys. Every key must be known and hold its kind of value, so
/// handlers read typed values that cannot be malformed.
struct KuitoGestureConfig {
    enum Kind {
        case bool, number, integer, hitSlop
    }

    private var bools: [String: Bool] = [:]
    private var numbers: [String: CGFloat] = [:]
    private(set) var hitSlop: KuitoGestureHitSlop?

    /// `gesture` names the gesture in errors.
    init(_ entries: [String: KuitoGestureConfigEntryValue], keys: [String: Kind], gesture: String) throws {
        for (key, value) in entries {
            guard let kind = keys[key] else {
                throw KuitoRenderError.Rejection("\(gesture) config key \"\(key)\"")
            }

            guard store(key, value, as: kind) else {
                throw KuitoRenderError.Rejection("\(gesture) config \"\(key)\": \(Self.described(value))")
            }
        }
    }

    func bool(_ key: String) -> Bool? { bools[key] }

    func number(_ key: String) -> CGFloat? { numbers[key] }

    /// Integer keys hold whole numbers only, so this conversion is exact.
    func integer(_ key: String) -> Int? { numbers[key].map { Int($0) } }

    private mutating func store(_ key: String, _ value: KuitoGestureConfigEntryValue, as kind: Kind) -> Bool {
        switch (kind, value) {
        case (.bool, .flag(let flag)):
            bools[key] = flag
        case (.number, .number(let number)):
            numbers[key] = CGFloat(number)
        case (.integer, .number(let number)):
            guard let integer = Int(exactly: number) else { return false }

            numbers[key] = CGFloat(integer)
        case (.hitSlop, _):
            guard let slop = KuitoGestureHitSlop(value) else { return false }

            hitSlop = slop
        case (.bool, _), (.number, _), (.integer, _):
            return false
        }

        return true
    }

    private static func described(_ value: KuitoGestureConfigEntryValue) -> String {
        switch value {
        case .number(let number): String(describing: number)
        case .flag(let flag): String(flag)
        case .edges(let edges): String(describing: edges)
        }
    }
}
