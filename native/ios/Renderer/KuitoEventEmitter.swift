import Foundation

/// Native events in Kuito's wire format (docs/events.md): the view's number
/// (0 for the app), the event, and its payload written into a record in the
/// layout src/protocol/manifest.ts declares (docs/events.md#typed-events). A
/// module view's own events, which the manifest does not lay out, carry JSON.
@MainActor
final class KuitoEventEmitter {
    /// True when the UI thread's kernel took the event, before returning.
    var send: ((UInt32, String, KuitoEventRecord) -> Bool)?
    private let record = KuitoEventRecord()
    /// An event sent while another is being sent, by a view its handler changed,
    /// gets a record of its own: the outer one may still go on to the JS thread.
    private var sending = false

    /// `payload` is the generated type the manifest names for the view's kind and `event`; nil for none.
    /// True when a UI-thread handler took it: what it changed is applied already.
    @discardableResult
    func emit(_ id: UInt32, _ event: String, _ payload: (any KuitoEventPayload)? = nil) -> Bool {
        deliver(id, event) { record in
            if let payload { payload.write(to: record) } else { record.begin(0) }
        }
    }

    /// A module view's event: JSON, every number JSON cannot hold sent as null.
    /// One without a payload is JSON too, empty: the manifest has no layout for it.
    func emitJSON(_ id: UInt32, _ event: String, _ payload: [String: Any]?) {
        guard let payload else {
            deliver(id, event) { $0.json("") }

            return
        }

        // JSONSerialization raises an Objective-C exception, which Swift cannot
        // catch, on NaN or Infinity.
        let json = Self.finite(payload)

        guard JSONSerialization.isValidJSONObject(json), let data = try? JSONSerialization.data(withJSONObject: json) else {
            preconditionFailure("Event \(event) of view \(id) carries a value JSON cannot hold: \(payload)")
        }

        deliver(id, event) { $0.json(String(decoding: data, as: UTF8.self)) }
    }

    @discardableResult
    private func deliver(_ id: UInt32, _ event: String, _ write: (KuitoEventRecord) -> Void) -> Bool {
        let nested = sending
        let record = nested ? KuitoEventRecord() : record

        write(record)
        sending = true
        defer { sending = nested }

        return send?(id, event, record) ?? false
    }

    /// `value` with every number JSON cannot hold replaced by null, as Android sends it.
    private static func finite(_ value: Any) -> Any {
        switch value {
        case let object as [String: Any]: object.mapValues(finite)
        case let array as [Any]: array.map(finite)
        case let number as NSNumber where CFNumberIsFloatType(number) && !number.doubleValue.isFinite: NSNull()
        default: value
        }
    }
}
