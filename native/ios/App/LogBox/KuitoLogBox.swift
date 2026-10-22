import Foundation

/// Warnings and errors the app produced, grouped: a repeat of the same entry
/// counts up instead of piling on. The dev server fills in source frames.
@MainActor
final class KuitoLogBox {
    /// What the LogBox shows; console `log`, `info` and `debug` only print.
    enum Level: String {
        case warn, error, fatal
    }

    struct Frame {
        enum Kind: String { case app, kuito, library, native }

        let name: String
        let kind: Kind
        let file: String?
        let line: Int?
        let column: Int?

        var location: String? {
            guard let file else { return nil }

            return line.map { "\(file):\($0)" } ?? file
        }
    }

    struct CodeFrame {
        let file: String
        let line: Int
        let column: Int
        let text: String
    }

    struct Entry {
        let id: String
        let level: Level
        let message: String
        let stack: String
        var count = 1
        var date = Date()
        /// Empty until the dev server answers.
        var frames: [Frame] = []
        var codeFrame: CodeFrame?

        var title: String { message.split(separator: "\n", maxSplits: 1).first.map(String.init) ?? message }

        /// The stack's frame lines, for when no dev server can symbolicate.
        var rawFrames: [String] {
            stack.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.hasPrefix("at ") }
        }
    }

    private(set) var entries: [Entry] = []
    private var serial = 0
    private var observers: [UUID: () -> Void] = [:]

    /// Records a console entry or failure; returns the entry it shows, if any.
    @discardableResult
    func record(level: String, message: String, stack: String) -> Entry? {
        guard let level = Level(rawValue: level) else { return nil }

        if let index = entries.firstIndex(where: { $0.level == level && $0.message == message }) {
            var entry = entries.remove(at: index)

            entry.count += 1
            entry.date = Date()
            entries.append(entry)
            changed()

            return nil
        }

        serial += 1

        let entry = Entry(id: String(serial), level: level, message: message, stack: stack)

        entries.append(entry)
        changed()

        return entry
    }

    /// The dev server's answer to an entry: frames and a code frame.
    func symbolicated(_ message: [String: Any]) {
        guard let id = message["id"] as? String,
              let index = entries.firstIndex(where: { $0.id == id }) else { return }

        let frames = (message["frames"] as? [[String: Any]] ?? []).map { frame in
            Frame(
                name: frame["name"] as? String ?? "",
                kind: (frame["kind"] as? String).flatMap(Frame.Kind.init(rawValue:)) ?? .app,
                file: frame["file"] as? String,
                line: (frame["line"] as? NSNumber)?.intValue,
                column: (frame["column"] as? NSNumber)?.intValue
            )
        }

        entries[index].frames = frames

        if let code = message["codeFrame"] as? [String: Any],
           let file = code["file"] as? String,
           let line = (code["line"] as? NSNumber)?.intValue,
           let text = code["frame"] as? String {
            entries[index].codeFrame = CodeFrame(file: file, line: line, column: (code["column"] as? NSNumber)?.intValue ?? 1, text: text)
        }

        changed()
    }

    func dismiss(_ id: String) {
        entries.removeAll { $0.id == id }
        changed()
    }

    /// A Live Patch that applies replaces the code a fatal error came from.
    func clearFatal() {
        guard entries.contains(where: { $0.level == .fatal }) else { return }

        entries.removeAll { $0.level == .fatal }
        changed()
    }

    func clear() {
        entries.removeAll()
        changed()
    }

    func count(_ level: Level) -> Int {
        entries.filter { $0.level == level || (level == .error && $0.level == .fatal) }.reduce(0) { $0 + $1.count }
    }

    /// The entry as text, for pasting into an issue or a chat.
    func report(_ entry: Entry) -> String {
        var lines = ["\(entry.level.rawValue.capitalized): \(entry.message)"]

        if let code = entry.codeFrame { lines += ["", "\(code.file):\(code.line):\(code.column)", code.text] }

        let frames = entry.frames.isEmpty
            ? entry.rawFrames
            : entry.frames.map { frame in ["at", frame.name.isEmpty ? "<anonymous>" : frame.name, frame.location.map { "(\($0))" }].compactMap { $0 }.joined(separator: " ") }

        if !frames.isEmpty { lines += [""] + frames }

        return lines.joined(separator: "\n")
    }

    @discardableResult
    func observe(_ observer: @escaping () -> Void) -> UUID {
        let id = UUID()

        observers[id] = observer
        observer()

        return id
    }

    func unobserve(_ id: UUID) {
        observers.removeValue(forKey: id)
    }

    private func changed() {
        for observer in observers.values { observer() }
    }
}
