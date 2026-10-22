import XCTest

/// The link table as the Hermes bridge calls it: functions by id, typed
/// arguments in and values out, observers started and stopped on the main
/// thread, and each module made once and destroyed with its runtime.
final class KuitoLinkerTests: XCTestCase {
    private final class Counter: KuitoLinkedModule {
        static var made = 0
        static var destroyed = 0

        var total = 0.0

        init(context: KuitoModuleContext) {
            Counter.made += 1
        }

        func destroy() {
            Counter.destroyed += 1
        }
    }

    private static func functions(_ id: Int32) -> KuitoFunction? {
        switch id {
        case 1:
            return KuitoFunction("Counter.add", thread: .js, arity: 2, signature: "(n,?n)n") { link, args, reply in
                let counter = link.module("Counter", Counter.self)

                counter.total += try args[0].number() * (try args[1].optional { try $0.number() } ?? 1)
                reply.resolve(counter.total)
            }
        case 2:
            return KuitoFunction("Counter.label", thread: .main, arity: 1, signature: "({prefix:s}){text:s,parts:[s}") { _, args, reply in
                let prefix = try args[0].field(0, "prefix").string()

                reply.resolve([prefix + "!", [prefix, "!"]])
            }
        case 4:
            return KuitoFunction("Counter.sum", thread: .js, arity: 1, signature: "(x)x") { _, args, reply in
                let bytes = try args[0].bytes()

                reply.resolve(Data([bytes.reduce(0, &+)]))
            }
        default:
            return nil
        }
    }

    private static func observers(_ id: Int32) -> KuitoObserver? {
        id == 3
            ? KuitoObserver("Counter.ticks", signature: "()n") { _, emit in emit(1.0) } stop: { _ in emitted.append("stopped") }
            : nil
    }

    private static var emitted: [String] = []

    override func setUp() {
        Counter.made = 0
        Counter.destroyed = 0
        KuitoLinkerTests.emitted = []
    }

    func testCallsAFunctionByIdAndMakesItsModuleOnce() {
        let linker = KuitoLinker(Self.functions, Self.observers)

        XCTAssertEqual(linker.call(1, arguments: [NSNumber(value: 2), NSNull()]) as? NSNumber, 2)
        XCTAssertEqual(linker.call(1, arguments: [NSNumber(value: 3), NSNumber(value: 2)]) as? NSNumber, 8)
        XCTAssertEqual(Counter.made, 1)
    }

    func testAnArgumentOfTheWrongTypeFailsNamingIt() {
        let failure = KuitoLinker(Self.functions, Self.observers).call(1, arguments: ["two"]) as? KuitoLinkFailure

        XCTAssertEqual(failure?.code, "ERR_ARGUMENT")
        XCTAssertEqual(failure?.message, "Counter.add argument 1 must be a number")
    }

    func testAnIdNotLinkedFailsAndSaysToRebuild() {
        let failure = KuitoLinker(Self.functions, Self.observers).call(9, arguments: []) as? KuitoLinkFailure

        XCTAssertEqual(failure?.code, "ERR_FUNCTION_NOT_FOUND")
        XCTAssertTrue(failure?.message.contains("rebuild") ?? false)
    }

    func testAStructCrossesAsItsFieldsInDeclaredOrderNestedDataIncluded() {
        let settled = expectation(description: "settled")
        var result: Any?

        KuitoLinker(Self.functions, Self.observers).callAsync(2, arguments: [["Go"]]) {
            result = $0
            settled.fulfill()
        }

        wait(for: [settled], timeout: 2)

        let fields = result as? [Any]

        XCTAssertEqual(fields?[0] as? String, "Go!")
        XCTAssertEqual(fields?[1] as? [String], ["Go", "!"])
    }

    func testAResultThatIsNotPlainDataFailsToEncode() {
        let failure = KuitoReply.crossing([Double.nan]) as? KuitoLinkFailure

        XCTAssertEqual(failure?.code, "ERR_ENCODE")
        XCTAssertNil(KuitoReply.crossing(["a": [1, "b", NSNull()]]) as? KuitoLinkFailure)
    }

    func testBytesCrossAsDataBothWays() {
        let linker = KuitoLinker(Self.functions, Self.observers)
        let result = linker.call(4, arguments: [Data([1, 2, 3]) as NSData])

        XCTAssertEqual(result as? Data, Data([6]))

        let failure = linker.call(4, arguments: ["AQI="]) as? KuitoLinkFailure

        XCTAssertEqual(failure?.message, "Counter.sum argument 1 must be an ArrayBuffer")
    }

    func testTheSignatureComesFromTheFunctionOrTheObserver() {
        let linker = KuitoLinker(Self.functions, Self.observers)

        XCTAssertEqual(linker.signature(1), "(n,?n)n")
        XCTAssertEqual(linker.signature(3), "()n")
        XCTAssertNil(linker.signature(9))
    }

    func testAnObserverSendsWhileObservedAndStopsWithTheRuntime() {
        let linker = KuitoLinker(Self.functions, Self.observers)
        let sent = expectation(description: "sent")

        linker.attachEmitter { id, value in
            XCTAssertEqual(id, 3)
            XCTAssertEqual(value as? NSNumber, 1)
            sent.fulfill()
        }
        linker.observe(3, observing: true)
        wait(for: [sent], timeout: 2)

        _ = linker.call(1, arguments: [NSNumber(value: 1)])
        linker.invalidate()

        let stopped = expectation(description: "main thread drained")

        DispatchQueue.main.async { stopped.fulfill() }
        wait(for: [stopped], timeout: 2)

        XCTAssertEqual(KuitoLinkerTests.emitted, ["stopped"])
        XCTAssertEqual(Counter.destroyed, 1, "the module made gives back what it holds")
    }
}
