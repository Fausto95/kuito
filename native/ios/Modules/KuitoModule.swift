import Foundation

/// An error a module throws or rejects with; JavaScript sees `code` and `message`.
/// Encodable so a native view can send one as an event's payload.
struct KuitoModuleError: Error, Encodable {
    let code: String
    let message: String

    init(_ code: String, _ message: String) {
        self.code = code
        self.message = message
    }
}

/// What a linked module is made with: its name in the link table.
final class KuitoModuleContext {
    let name: String

    init(name: String) {
        self.name = name
    }
}
