/// The bridge's event entry points, given the record a renderer wrote: its
/// parts cross into Objective-C++, which copies them before returning.
extension KuitoHermesBridge {
    func handleUIEvent(handle: UInt32, event: String, record: KuitoEventRecord) -> Bool {
        record.numbers.withUnsafeBufferPointer { numbers in
            handleUIEvent(
                handle: handle, event: event, layout: record.layout, numbers: numbers.baseAddress,
                count: numbers.count, strings: record.strings, json: record.json
            )
        }
    }

    func dispatchEvent(handle: UInt32, event: String, record: KuitoEventRecord, completion: @escaping (Error?) -> Void) {
        record.numbers.withUnsafeBufferPointer { numbers in
            dispatchEvent(
                handle: handle, event: event, layout: record.layout, numbers: numbers.baseAddress,
                count: numbers.count, strings: record.strings, json: record.json, completion: completion
            )
        }
    }

    /// An event of the shell's own, to JavaScript only.
    func dispatchEvent(handle: UInt32, event: String, payload: any KuitoEventPayload, completion: @escaping (Error?) -> Void) {
        let record = KuitoEventRecord()

        payload.write(to: record)
        dispatchEvent(handle: handle, event: event, record: record, completion: completion)
    }
}
