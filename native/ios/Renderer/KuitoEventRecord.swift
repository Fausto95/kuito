/// A native event's payload in its fixed layout (docs/events.md#typed-events):
/// numbers and booleans by slot, then strings, as KuitoEvents.generated.swift
/// writes them; or, for a module view's own event, JSON text. The emitter
/// reuses one while no other event is being sent.
final class KuitoEventRecord {
    /// The layout's id (native/shared/EventLayouts.generated.h): 0 for no payload.
    private(set) var layout: Int32 = 0
    private(set) var numbers: [Double] = []
    private(set) var strings: [String] = []
    /// A module view's payload, which the manifest does not lay out.
    private(set) var json: String?

    init() {
        numbers.reserveCapacity(Self.capacity)
    }

    func begin(_ layout: Int32) {
        self.layout = layout
        numbers.removeAll(keepingCapacity: true)
        strings.removeAll(keepingCapacity: true)
        json = nil
    }

    func number(_ value: Double) {
        numbers.append(value)
    }

    func string(_ value: String) {
        strings.append(value)
    }

    func json(_ text: String) {
        begin(0)
        json = text
    }
}
