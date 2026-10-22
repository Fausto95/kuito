import XCTest

/// A record of the host batch as Swift reads it (KuitoMutationRecord.h).
final class KuitoMutationRecordTests: XCTestCase {
    /// An enum crosses as its index alone: its text comes from the generated tables.
    func testAnEnumReadsItsTextFromItsIndex() throws {
        var record = KuitoMutationRecord()

        record.op = KuitoMutationOp.prop.rawValue
        record.kind = 5
        record.key = UInt16(try XCTUnwrap(KuitoProps.byKey.firstIndex(of: "alignItems")))
        record.enumValue = 5

        XCTAssertNil(record.text)
        XCTAssertEqual(record.value, .enumValue(5, "center"))
    }
}
