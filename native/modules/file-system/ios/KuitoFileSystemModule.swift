import Foundation

/// `FileSystem` in native/modules/file-system/file-system.ts. File work runs
/// on the module's background queue; downloads and uploads stream on the HTTP
/// host (native/shared/Http.h), to and from the files `sandboxed` resolves.
final class KuitoFileSystemModule: FileSystemSpec {
    private let sandbox = KuitoSandbox.app
    private let files = FileManager.default

    init(context: KuitoModuleContext) {}

    func directories() -> FileDirectories {
        FileDirectories(document: sandbox.document.absoluteString, cache: sandbox.cache.absoluteString,
                        bundle: sandbox.bundle.absoluteString)
    }

    func getInfo(_ uri: String) throws -> FileStat {
        try Self.info(sandbox.url(uri, .read), uri: uri)
    }

    func readText(_ uri: String) throws -> String {
        guard let text = String(data: try Data(contentsOf: Self.existing(sandbox.url(uri, .read), uri)), encoding: .utf8) else {
            throw KuitoModuleError("ERR_ENCODING", "\(uri) is not UTF-8; read it with readBytes")
        }

        return text
    }

    // Read into memory, never mapped: the ArrayBuffer shares these bytes, and JavaScript may write them.
    func readBytes(_ request: FileByteRange) throws -> Data {
        let handle = try FileHandle(forReadingFrom: Self.existing(sandbox.url(request.uri, .read), request.uri))

        defer { try? handle.close() }

        try handle.seek(toOffset: UInt64(request.position ?? 0))

        let data = try request.length.map { try handle.read(upToCount: Int($0)) } ?? handle.readToEnd()

        return data ?? Data()
    }

    func writeText(_ request: FileTextWrite) throws {
        try write(Data(request.contents.utf8), to: request.uri, append: request.append)
    }

    func writeBytes(_ request: FileBytesWrite) throws {
        try write(request.contents, to: request.uri, append: request.append)
    }

    private func write(_ data: Data, to uri: String, append: Bool) throws {
        let url = try sandbox.url(uri, .write)

        guard append, files.fileExists(atPath: url.path) else { return try data.write(to: url, options: .atomic) }

        let handle = try FileHandle(forWritingTo: url)

        defer { try? handle.close() }

        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }

    func makeDirectory(_ uri: String, _ intermediates: Bool) throws {
        try files.createDirectory(at: sandbox.url(uri, .write), withIntermediateDirectories: intermediates)
    }

    func delete(_ uri: String, _ idempotent: Bool) throws {
        let url = try sandbox.url(uri, .write)

        if idempotent, !files.fileExists(atPath: url.path) { return }

        try files.removeItem(at: Self.existing(url, uri))
    }

    func move(_ from: String, _ to: String) throws {
        let source = try Self.existing(sandbox.url(from, .write), from)
        let target = try sandbox.url(to, .write)

        try Self.replace(target) { try files.moveItem(at: source, to: target) }
    }

    func copy(_ from: String, _ to: String) throws {
        let source = try Self.existing(sandbox.url(from, .read), from)
        let target = try sandbox.url(to, .write)

        try Self.replace(target) { try files.copyItem(at: source, to: target) }
    }

    func readDirectory(_ uri: String) throws -> [String] {
        try files.contentsOfDirectory(atPath: Self.existing(sandbox.url(uri, .read), uri).path).sorted()
    }

    // Where the HTTP host streams a transfer: a file to read that exists,
    // or one to write whose directory does.
    func sandboxed(_ uri: String, _ access: FileAccess) throws -> String {
        switch access {
        case .read:
            let url = try Self.existing(sandbox.url(uri, .read), uri)
            var directory: ObjCBool = false

            if files.fileExists(atPath: url.path, isDirectory: &directory), directory.boolValue {
                throw KuitoModuleError("ERR_NOT_FOUND", "\(uri) is a directory, not a file")
            }

            return url.absoluteString
        case .write:
            let url = try sandbox.url(uri, .write)

            _ = try Self.existing(url.deletingLastPathComponent(), uri)

            return url.absoluteString
        }
    }

    private static func existing(_ url: URL, _ uri: String) throws -> URL {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw KuitoModuleError("ERR_NOT_FOUND", "Nothing exists at \(uri)")
        }

        return url
    }

    /// Runs `write` with nothing at `target`; what was there is gone only if it succeeds.
    private static func replace(_ target: URL, _ write: () throws -> Void) throws {
        let files = FileManager.default

        guard files.fileExists(atPath: target.path) else { return try write() }

        let parked = target.deletingLastPathComponent()
            .appendingPathComponent(".kuito-replaced-" + UUID().uuidString)

        try files.moveItem(at: target, to: parked)

        do {
            try write()
            try? files.removeItem(at: parked)
        } catch {
            try? files.moveItem(at: parked, to: target)
            throw error
        }
    }

    private static func info(_ url: URL, uri: String) throws -> FileStat {
        let files = FileManager.default
        var directory: ObjCBool = false

        guard files.fileExists(atPath: url.path, isDirectory: &directory) else {
            return FileStat(exists: false, uri: uri)
        }

        let attributes = try files.attributesOfItem(atPath: url.path)
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        var size = (attributes[.size] as? NSNumber)?.doubleValue ?? 0

        // A directory's size is its files'.
        if directory.boolValue {
            size = 0

            let entries = files.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey])

            while let file = entries?.nextObject() as? URL {
                size += Double((try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
            }
        }

        return FileStat(exists: true, uri: url.absoluteString, isDirectory: directory.boolValue, size: size,
                        modificationTime: modified)
    }
}
