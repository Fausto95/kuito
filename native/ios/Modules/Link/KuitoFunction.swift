import Foundation

/// A module the link table makes: one instance per runtime, created on the
/// first call that needs it. Each spec's generated `<Name>Spec` refines it.
protocol KuitoLinkedModule: AnyObject {
    init(context: KuitoModuleContext)

    /// Runs on the main thread when the runtime shuts down (a reload, or the
    /// app closing), after its observers stop: give back what the module
    /// holds outside the runtime, as the idle timer.
    func destroy()
}

extension KuitoLinkedModule {
    func destroy() {}
}

/// One function of the link table, which the CLI generates from the specs
/// (docs/native-modules.md): its name for errors, where it runs, how many
/// arguments it takes, the signature the C++ converts its values by
/// (src/cli/link-signature.ts), and the call, which settles `reply` once.
struct KuitoFunction {
    typealias Run = (_ link: KuitoLinkContext, _ args: [KuitoArgument], _ reply: KuitoReply) throws -> Void

    let name: String
    let thread: KuitoThread
    let arity: Int
    let signature: String
    let run: Run

    /// The module the function belongs to: `Battery` for `Battery.level`.
    var module: String { String(name.prefix { $0 != "." }) }

    init(_ name: String, thread: KuitoThread, arity: Int, signature: String, run: @escaping Run) {
        self.name = name
        self.thread = thread
        self.arity = arity
        self.signature = signature
        self.run = run
    }
}

/// An event, a live value or a motion value of the link table: how it starts
/// sending what it observes, on the main thread, and how it stops.
struct KuitoObserver {
    typealias Start = (_ link: KuitoLinkContext, _ emit: @escaping (Any) -> Void) -> Void
    typealias Stop = (_ link: KuitoLinkContext) -> Void

    let name: String
    /// `()T`, T what it sends (src/cli/link-signature.ts).
    let signature: String
    /// A motion value: what it sends is written into the UI runtime too.
    let motion: Bool
    let start: Start
    let stop: Stop

    init(_ name: String, signature: String, motion: Bool = false, start: @escaping Start, stop: @escaping Stop) {
        self.name = name
        self.signature = signature
        self.motion = motion
        self.start = start
        self.stop = stop
    }
}

/// Sends an event's payloads to JavaScript, from any thread, from `start<Name>` until `stop<Name>`.
final class KuitoEmitter<Payload> {
    private let emit: (Any) -> Void
    private let encode: (Payload) -> Any

    init(_ emit: @escaping (Any) -> Void, encode: @escaping (Payload) -> Any) {
        self.emit = emit
        self.encode = encode
    }

    func send(_ payload: Payload) {
        emit(encode(payload))
    }
}

extension KuitoEmitter where Payload == Void {
    func send() {
        send(())
    }
}

/// Sets a live value's signal in JavaScript, from any thread, from `start<Name>` until `stop<Name>`.
final class KuitoSignal<Value> {
    private let emit: (Any) -> Void
    private let encode: (Value) -> Any

    init(_ emit: @escaping (Any) -> Void, encode: @escaping (Value) -> Any) {
        self.emit = emit
        self.encode = encode
    }

    func set(_ value: Value) {
        emit(encode(value))
    }
}

/// Sets a motion value, from `start<Name>` until `stop<Name>`: the UI runtime
/// applies it on the main thread, so views bound to it move without
/// JavaScript, which hears of it after.
final class KuitoMotion<Value> {
    private let emit: (Any) -> Void
    private let encode: (Value) -> Any

    init(_ emit: @escaping (Any) -> Void, encode: @escaping (Value) -> Any) {
        self.emit = emit
        self.encode = encode
    }

    func set(_ value: Value) {
        emit(encode(value))
    }
}

/// Settles a call with its result as plain data, once and from any thread;
/// later settlements are ignored.
final class KuitoReply {
    private let lock = NSLock()
    private var settle: ((Any) -> Void)?

    init(_ settle: @escaping (_ result: Any) -> Void) {
        self.settle = settle
    }

    func resolve(_ value: Any) {
        finish(KuitoReply.crossing(value))
    }

    func reject(_ error: Error) {
        finish(KuitoLinkFailure(error))
    }

    private func finish(_ result: Any) {
        lock.lock()
        let settle = self.settle
        self.settle = nil
        lock.unlock()
        settle?(result)
    }

    /// `value` if it can cross: null, a number, a string, Data, and arrays and
    /// string-keyed dictionaries of them; otherwise an `ERR_ENCODE` failure.
    static func crossing(_ value: Any) -> Any {
        if value is KuitoLinkFailure { return value }

        return crosses(value) ? value : KuitoLinkFailure(encoding: "the result")
    }

    private static func crosses(_ value: Any) -> Bool {
        switch value {
        case is NSNull, is String, is Data:
            return true
        case let number as NSNumber:
            // Not NaN or infinity: what crosses is plain data, as JSON would hold it.
            return KuitoArgument.isBoolean(number) || number.doubleValue.isFinite
        case let items as [Any]:
            return items.allSatisfy(crosses)
        case let fields as [String: Any]:
            return fields.values.allSatisfy(crosses)
        default:
            return false
        }
    }
}

/// The result of a callback function, such as a permission prompt: settle it
/// once, from any thread; later calls are ignored. A promise never settled
/// leaves JavaScript waiting.
final class KuitoPromise<Value> {
    private let reply: KuitoReply
    private let encode: (Value) -> Any

    init(_ reply: KuitoReply, encode: @escaping (Value) -> Any) {
        self.reply = reply
        self.encode = encode
    }

    func resolve(_ value: Value) {
        reply.resolve(encode(value))
    }

    func reject(_ error: Error) {
        reply.reject(error)
    }

    func reject(_ code: String, _ message: String) {
        reply.reject(KuitoModuleError(code, message))
    }
}

extension KuitoPromise where Value == Void {
    func resolve() {
        resolve(())
    }
}

extension KuitoLinkFailure {
    /// A thrown error as it crosses: a `KuitoModuleError` keeps its code, any other is `ERR_NATIVE`.
    convenience init(_ error: Error) {
        let coded = error as? KuitoModuleError

        self.init(code: coded?.code ?? KuitoErrorCode.native, message: coded?.message ?? error.localizedDescription)
    }

    convenience init(encoding what: String) {
        self.init(code: KuitoErrorCode.encode, message: "\(what) is not plain data")
    }
}
