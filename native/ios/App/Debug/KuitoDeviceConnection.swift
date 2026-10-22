import Foundation
import UIKit

/// The on-device engine's dev link: JavaScript runs in Hermes on the device;
/// the dev server sends compiled source patches and commands, and maps the
/// device's console entries back to source. The messages are
/// src/protocol/dev-link.ts's (KuitoDevLink.generated.swift).
@MainActor
final class KuitoDeviceConnection {
    var onState: ((KuitoConnectionState) -> Void)?
    var onPatch: ((_ source: String, _ revision: Int) -> Void)?
    var onCommand: ((String) -> Void)?
    /// The frames of a logged entry, answered by the dev server.
    var onSymbolicated: (([String: Any]) -> Void)?
    private let socket: KuitoDevSocket

    init(url: URL) {
        socket = KuitoDevSocket(url: url)
        socket.onState = { [weak self] state in
            // Each connection starts by saying which device this is.
            if state == .connected { self?.hello() }
            self?.onState?(state)
        }
        socket.onMessage = { [weak self] message in self?.handle(message) }
    }

    func start() { socket.start() }

    func stop() { socket.stop() }

    /// Prints the entry in the terminal; with an `id`, the server answers with its frames.
    func sendLog(level: String, message: String, stack: String, id: String?) {
        var entry: [String: Any] = [
            "type": KuitoDeviceMessage.log.rawValue, "level": level, "message": message, "stack": stack,
        ]

        entry["id"] = id
        socket.send(entry)
    }

    /// Opens a source position in the developer's editor.
    func open(file: String, line: Int, column: Int) {
        socket.send(["type": KuitoDeviceMessage.open.rawValue, "file": file, "line": line, "column": column])
    }

    /// Acks a patch the engine evaluated, with how long evaluating it took.
    func applied(revision: Int, milliseconds: Double) {
        socket.send(["type": KuitoDeviceMessage.applied.rawValue, "revision": revision, "ms": milliseconds])
    }

    /// Acks a patch that failed; the previous version stays live.
    func rejected(revision: Int, code: String, message: String) {
        socket.send([
            "type": KuitoDeviceMessage.rejected.rawValue, "revision": revision, "code": code, "message": message,
        ])
    }

    /// Answers the `record` command: the runtime's recording and the native view tree.
    func recording(_ recording: Data, tree: String) {
        socket.send([
            "type": KuitoDeviceMessage.recording.rawValue, "recording": recording.base64EncodedString(), "tree": tree,
        ])
    }

    private func hello() {
        let name = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? UIDevice.current.name
        let id = UIDevice.current.identifierForVendor?.uuidString ?? name

        socket.send(["type": KuitoDeviceMessage.hello.rawValue, "id": id, "name": name, "platform": "ios"])
    }

    private func handle(_ message: [String: Any]) {
        guard let type = (message["type"] as? String).flatMap(KuitoServerMessage.init(rawValue:)) else { return }

        switch type {
        case .patch:
            guard let source = message["source"] as? String else { return }

            onPatch?(source, (message["revision"] as? NSNumber)?.intValue ?? 0)
        case .command:
            if let name = message["name"] as? String { onCommand?(name) }
        case .symbolicated:
            onSymbolicated?(message)
        }
    }
}
