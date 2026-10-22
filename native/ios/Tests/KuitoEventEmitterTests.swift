import XCTest

/// Events cross in records (docs/events.md#typed-events): a payload's fields in
/// its layout's order, the emitter's one record reused, and a module view's
/// own events as JSON, every number JSON cannot hold sent as null, as
/// Android's emitter sends it.
@MainActor
final class KuitoEventEmitterTests: XCTestCase {
    private struct Sent: Equatable {
        let id: UInt32
        let event: String
        let layout: Int32
        let numbers: [Double]
        let strings: [String]
        let json: String?

        init(_ id: UInt32, _ event: String, _ record: KuitoEventRecord) {
            self.id = id
            self.event = event
            layout = record.layout
            numbers = record.numbers
            strings = record.strings
            json = record.json
        }
    }

    private let emitter = KuitoEventEmitter()
    private var sent: [Sent] = []

    override func setUp() async throws {
        emitter.send = { [unowned self] id, event, record in
            sent.append(Sent(id, event, record))

            return false
        }
    }

    func testAPayloadsNumbersLandInLayoutOrder() {
        emitter.emit(7, "scroll", KuitoScrollPayload(x: 1, y: 2, contentWidth: 3, contentHeight: 4, layoutWidth: 5, layoutHeight: 6))

        XCTAssertEqual(sent.map(\.layout), [KuitoScrollPayload.layout])
        XCTAssertEqual(sent.map(\.numbers), [[1, 2, 3, 4, 5, 6]])
        XCTAssertEqual(sent.map(\.strings), [[]])
    }

    func testAPayloadsNumbersAndStringsLandInLayoutOrder() {
        emitter.emit(0, "keyboard.willshow", KuitoKeyboardFramePayload(
            screenX: 0, screenY: 500, width: 390, height: 344, duration: 250, easing: "keyboard"
        ))

        XCTAssertEqual(sent, [Sent(0, "keyboard.willshow", record(layout: KuitoKeyboardFramePayload.layout, [0, 500, 390, 344, 250], ["keyboard"]))])
    }

    func testAnEventWithoutAPayloadSendsAnEmptyRecord() {
        emitter.emit(7, "focus")

        XCTAssertEqual(sent, [Sent(7, "focus", record(layout: 0, [], []))])
    }

    func testAFieldAGestureDoesNotReportIsNaN() {
        emitter.emit(7, "gesture", KuitoGesturePayload(handlerTag: 1, state: 4, numberOfPointers: 1, pointerType: 0, translationX: 12))

        let numbers = sent.first?.numbers ?? []

        XCTAssertEqual(numbers.count, 21)
        XCTAssertEqual(numbers[9], 12, "translationX")
        XCTAssertTrue(numbers[13].isNaN, "scale")
    }

    func testAnEventSentWhileAnotherIsSentGetsItsOwnRecord() {
        var outer: KuitoEventRecord?
        var inner: KuitoEventRecord?

        emitter.send = { [unowned self] id, event, record in
            if event == "change" {
                outer = record
                emitter.emit(id, "selectionchange", KuitoTextSelection(start: 1, end: 2))
                sent.append(Sent(id, event, record))
            } else {
                inner = record
            }

            return false
        }
        emitter.emit(7, "change", KuitoTextPayload(text: "ab"))

        XCTAssertNotNil(inner)
        XCTAssertFalse(outer === inner)
        XCTAssertEqual(sent, [Sent(7, "change", record(layout: KuitoTextPayload.layout, [], ["ab"]))])
    }

    func testTheNextEventReusesTheRecord() {
        var records: [KuitoEventRecord] = []

        emitter.send = { _, _, record in
            records.append(record)

            return false
        }
        emitter.emit(7, "press")
        emitter.emit(7, "press")

        XCTAssertEqual(records.count, 2)
        XCTAssertTrue(records.first === records.last)
    }

    func testAModuleViewSendsAFinitePayload() {
        emitter.emitJSON(7, "scroll", ["y": 12])

        XCTAssertEqual(sent.map(\.json), [#"{"y":12}"#])
    }

    func testAModuleViewsEventWithoutAPayloadIsEmptyJSON() {
        emitter.emitJSON(7, "ended", nil)

        // JSON, not a record: the manifest has no layout for a module view's own event.
        XCTAssertEqual(sent.map(\.json), [""])
    }

    func testAModuleViewSendsNaNAsNull() {
        emitter.emitJSON(7, "scroll", ["y": Double.nan])

        XCTAssertEqual(sent.map(\.json), [#"{"y":null}"#])
    }

    func testAModuleViewSendsInfinityAsNull() {
        emitter.emitJSON(7, "scroll", ["y": Double.infinity])

        XCTAssertEqual(sent.map(\.json), [#"{"y":null}"#])
    }

    func testAModuleViewSendsANestedNaNAsNull() {
        emitter.emitJSON(7, "scroll", ["offset": ["y": Double.nan], "items": [-Double.infinity]])

        XCTAssertEqual(
            sent.compactMap(\.json).map(decoded),
            [["offset": ["y": NSNull()], "items": [NSNull()]] as NSDictionary]
        )
    }

    private func record(layout: Int32, _ numbers: [Double], _ strings: [String]) -> KuitoEventRecord {
        let record = KuitoEventRecord()

        record.begin(layout)
        numbers.forEach(record.number)
        strings.forEach(record.string)

        return record
    }

    private func decoded(_ json: String) -> NSDictionary? {
        try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? NSDictionary
    }
}
