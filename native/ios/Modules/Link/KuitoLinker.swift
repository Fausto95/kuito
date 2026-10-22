import Foundation

/// A runtime's linked modules: each made on the first call that needs it,
/// from whichever thread that call runs on, and a serial background queue
/// per module.
final class KuitoLinkContext {
    // Recursive: a module's init may call a module it requires.
    private let lock = NSRecursiveLock()
    private var instances: [String: KuitoLinkedModule] = [:]
    private var queues: [String: DispatchQueue] = [:]

    func module<M: KuitoLinkedModule>(_ name: String, _ type: M.Type) -> M {
        lock.lock()
        defer { lock.unlock() }

        if let existing = instances[name] as? M { return existing }

        let made = M(context: KuitoModuleContext(name: name))

        instances[name] = made

        return made
    }

    /// Every module made, given back on the main thread; the context makes none after.
    func destroy() {
        lock.lock()
        let made = Array(instances.values)
        instances.removeAll()
        lock.unlock()

        DispatchQueue.main.async { made.forEach { $0.destroy() } }
    }

    func queue(_ module: String) -> DispatchQueue {
        lock.lock()
        defer { lock.unlock() }

        if let queue = queues[module] { return queue }

        let queue = DispatchQueue(label: "dev.kuito.module." + module)

        queues[module] = queue

        return queue
    }
}

/// The link table as the Hermes bridge calls it (KuitoLinkHost): functions
/// by id from the generated `KuitoLink.function`, each run on its thread,
/// and the events and live values of `KuitoLink.observer`. Calls arrive on
/// the VM queue, so the tables of found members need no lock.
final class KuitoLinker: NSObject, KuitoLinkHost {
    private let table: (Int32) -> KuitoFunction?
    private let observers: (Int32) -> KuitoObserver?
    private let link = KuitoLinkContext()
    private var found: [Int32: KuitoFunction] = [:]
    private var observing: [Int32: KuitoObserver] = [:]
    private var emitter: KuitoLinkEmit?
    private var motionWriter: KuitoLinkEmit?

    init(_ table: @escaping (Int32) -> KuitoFunction?, _ observers: @escaping (Int32) -> KuitoObserver?) {
        self.table = table
        self.observers = observers
    }

    func attachEmitter(_ emit: @escaping KuitoLinkEmit) {
        emitter = emit
    }

    func attachMotionWriter(_ write: @escaping KuitoLinkEmit) {
        motionWriter = write
    }

    func observe(_ id: Int32, observing active: Bool) {
        guard let observer = observing[id] ?? observers(id) else { return }

        let link = self.link

        if active {
            let emit = emitter
            let write = observer.motion ? motionWriter : nil

            observing[id] = observer
            DispatchQueue.main.async {
                observer.start(link) { value in
                    let crossing = KuitoReply.crossing(value)

                    write?(id, crossing)
                    emit?(id, crossing)
                }
            }
        } else if observing.removeValue(forKey: id) != nil {
            DispatchQueue.main.async { observer.stop(link) }
        }
    }

    // The generated tables are pure, so either thread may read them; the caches are the VM queue's.
    func signature(_ member: Int32) -> String? {
        table(member)?.signature ?? observers(member)?.signature
    }

    func call(_ id: Int32, arguments: [Any]) -> Any {
        var result: Any?

        do {
            let function = try self.function(id)

            guard function.thread == .js else {
                throw KuitoModuleError(KuitoErrorCode.thread, "\(function.name) is asynchronous")
            }

            try function.run(link, values(function, arguments), KuitoReply { result = $0 })

            return result ?? KuitoLinkFailure(code: KuitoErrorCode.native, message: "\(function.name) returned without a result")
        } catch {
            return KuitoLinkFailure(error)
        }
    }

    func callOnMain(_ id: Int32, arguments: [Any]) -> Any {
        var result: Any?

        do {
            // Not the VM queue's cache: this runs on the main thread.
            guard let function = table(id), function.thread == .main else {
                throw KuitoModuleError(KuitoErrorCode.thread, "Function \(id) does not run on the main thread")
            }

            try function.run(link, values(function, arguments), KuitoReply { result = $0 })

            return result ?? KuitoLinkFailure(code: KuitoErrorCode.thread, message: "\(function.name) answers later: call it from the JS thread")
        } catch {
            return KuitoLinkFailure(error)
        }
    }

    func callAsync(_ id: Int32, arguments: [Any], settle: @escaping KuitoLinkSettle) {
        let reply = KuitoReply(settle)

        do {
            let function = try self.function(id)
            let values = try values(function, arguments)
            let run = { [link] in
                do { try function.run(link, values, reply) } catch { reply.reject(error) }
            }

            switch function.thread {
            case .js: run()
            case .main: DispatchQueue.main.async(execute: run)
            case .background: link.queue(function.module).async(execute: run)
            }
        } catch {
            reply.reject(error)
        }
    }

    func invalidate() {
        let link = self.link

        for observer in observing.values { DispatchQueue.main.async { observer.stop(link) } }

        observing.removeAll()
        emitter = nil
        motionWriter = nil
        link.destroy()
    }

    private func function(_ id: Int32) throws -> KuitoFunction {
        if let function = found[id] { return function }

        guard let function = table(id) else {
            throw KuitoModuleError(KuitoErrorCode.functionNotFound,
                "Function \(id) is not linked into this iOS shell, which has the functions the app calls: rebuild it (docs/native-modules.md).")
        }

        found[id] = function

        return function
    }

    /// One value per parameter; a missing trailing argument is null.
    private func values(_ function: KuitoFunction, _ arguments: [Any]) throws -> [KuitoArgument] {
        guard arguments.count <= function.arity else {
            throw KuitoModuleError(KuitoErrorCode.argument, "\(function.name) takes \(function.arity) arguments, not \(arguments.count)")
        }

        return (0..<function.arity).map { index in
            KuitoArgument(index < arguments.count ? arguments[index] : NSNull(), path: "\(function.name) argument \(index + 1)")
        }
    }
}
