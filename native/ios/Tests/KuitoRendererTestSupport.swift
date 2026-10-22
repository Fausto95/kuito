import Foundation
import XCTest

/// Tests name props as app code does; the renderer takes them keyed, as a
/// host batch's records carry them.
@MainActor
extension KuitoUIKitRenderer {
    func setProperty(id: UInt32, name: String, value: KuitoValue) throws {
        try setProperty(id: id, key: kuitoKey(name), name: name, value: value)
    }

    func setDrivenProperty(id: UInt32, name: String, value: KuitoValue) throws {
        try setDrivenProperty(id: id, key: kuitoKey(name), name: name, value: value)
    }
}

/// The prop's key on the wire, or the named-prop key for a module view's own.
func kuitoKey(_ name: String) -> UInt16 {
    KuitoProps.byKey.firstIndex(of: name).map(UInt16.init) ?? kuitoNamedProp
}

/// An event as its name, then its record's layout, numbers and strings, or
/// its JSON with the keys sorted: JSONSerialization keeps no order.
func describeEvent(_ event: String, _ record: KuitoEventRecord) -> String {
    if let json = record.json {
        guard let object = try? JSONSerialization.jsonObject(with: Data(json.utf8)),
              let sorted = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
        else { return "\(event) \(json)" }

        return "\(event) \(String(decoding: sorted, as: UTF8.self))"
    }

    guard record.layout != 0 else { return event }

    return "\(event) \(record.layout) \(record.numbers) \(record.strings)"
}

/// The event as describeEvent describes the record `payload` writes.
func describeEvent(_ event: String, _ payload: any KuitoEventPayload) -> String {
    let record = KuitoEventRecord()

    payload.write(to: record)

    return describeEvent(event, record)
}

/// The counters by name, as `kuito/tests` names them (docs/performance.md#cost-counters).
extension KuitoCost {
    /// Skips a test of what Release compiles out: the counters and the frame
    /// receipts exist in Debug only, so in Release every count reads 0.
    static func requireInstruments() throws {
        #if !DEBUG
            throw XCTSkip("cost counters and frame receipts are compiled out of Release (docs/performance.md#cost-counters)")
        #endif
    }

    var counts: [(name: String, count: Int)] {
        Mirror(reflecting: self).children.compactMap { child in
            guard let name = child.label, let count = child.value as? Int else { return nil }

            return (name, count)
        }
    }

    /// Fails the test, naming every counter over `budget`, as `toStayWithin` does headlessly.
    func toStayWithin(_ budget: [String: Int], file: StaticString = #filePath, line: UInt = #line) {
        let counts = Dictionary(uniqueKeysWithValues: counts.map { ($0.name, $0.count) })
        let over = budget.sorted { $0.key < $1.key }.compactMap { name, most -> String? in
            guard let count = counts[name] else { return "\(name) is not a counter" }

            return count > most ? "\(name) \(count), budget \(most)" : nil
        }

        if !over.isEmpty { XCTFail("Over budget: \(over.joined(separator: "; "))", file: file, line: line) }
    }
}
