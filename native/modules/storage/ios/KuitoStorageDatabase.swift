import Foundation
import SQLite3

/// A value SQLite binds and returns, as it crosses in JSON: JavaScript turns
/// booleans into 1 and 0, and a BLOB has no JSON form.
enum KuitoSQLValue {
    case integer(Int64)
    case real(Double)
    case text(String)
    case null

    /// A whole number binds as an INTEGER: a JavaScript number has no integer type.
    init(_ json: Any) throws {
        switch json {
        case is NSNull: self = .null
        case let text as String: self = .text(text)
        case let number as NSNumber where !KuitoArgument.isBoolean(number):
            let real = number.doubleValue

            self = Int64(exactly: real).map { .integer($0) } ?? .real(real)
        default:
            throw KuitoModuleError("ERR_ARGUMENT", "expected a string, number or null to bind, got \(json)")
        }
    }

    var json: Any {
        switch self {
        case let .integer(integer): return integer
        case let .real(real): return real
        case let .text(text): return text
        case .null: return NSNull()
        }
    }
}

/// The process's one connection to the Storage table, in Application Support.
/// Every call takes the lock, so the JS thread's synchronous reads and the
/// module's background queue share it safely; a runtime reload reuses it.
final class KuitoStorageDatabase {
    private static let lock = NSLock()
    private static var opened: KuitoStorageDatabase?

    static func shared() throws -> KuitoStorageDatabase {
        lock.lock()
        defer { lock.unlock() }

        if let opened { return opened }

        let directory = try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("Kuito", isDirectory: true)

        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let database = try KuitoStorageDatabase(path: directory.appendingPathComponent("storage.sqlite").path)

        opened = database
        return database
    }

    // SQLite copies bound text before the statement runs.
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private let lock = NSLock()
    private let db: OpaquePointer
    private var migrated = false

    private init(path: String) throws {
        var handle: OpaquePointer?
        let status = sqlite3_open_v2(path, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX, nil)

        guard status == SQLITE_OK, let handle else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "out of memory"

            sqlite3_close(handle)
            throw KuitoModuleError("ERR_STORAGE", "Could not open \(path): \(message)")
        }

        db = handle
        // WAL with synchronous=NORMAL: a committed write survives the app
        // being killed; a power loss may drop the last commits, never corrupt.
        try execute("PRAGMA journal_mode=WAL")
        try execute("PRAGMA synchronous=NORMAL")
        try execute("CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
    }

    func get(_ keys: [String]) throws -> [String?] {
        try locked {
            try statement("SELECT value FROM storage WHERE key = ?") { select in
                try keys.map { key in
                    sqlite3_reset(select)
                    bind(key, to: select, at: 1)

                    switch sqlite3_step(select) {
                    case SQLITE_ROW: return text(select, column: 0)
                    case SQLITE_DONE: return nil
                    default: throw failure("read \(key)")
                    }
                }
            }
        }
    }

    func set(_ entries: [(key: String, value: String)]) throws {
        try transaction {
            try statement("INSERT OR REPLACE INTO storage (key, value) VALUES (?, ?)") { insert in
                for entry in entries {
                    sqlite3_reset(insert)
                    bind(entry.key, to: insert, at: 1)
                    bind(entry.value, to: insert, at: 2)
                    try step(insert, "write \(entry.key)")
                }
            }
        }
    }

    func remove(_ keys: [String]) throws {
        try transaction {
            try statement("DELETE FROM storage WHERE key = ?") { delete in
                for key in keys {
                    sqlite3_reset(delete)
                    bind(key, to: delete, at: 1)
                    try step(delete, "remove \(key)")
                }
            }
        }
    }

    func keys() throws -> [String] {
        try locked {
            try statement("SELECT key FROM storage") { select in
                var keys: [String] = []

                while true {
                    switch sqlite3_step(select) {
                    case SQLITE_ROW: keys.append(text(select, column: 0))
                    case SQLITE_DONE: return keys
                    default: throw failure("list the keys")
                    }
                }
            }
        }
    }

    func clear() throws {
        try locked { try execute("DELETE FROM storage") }
    }

    func select(_ sql: String, _ params: [KuitoSQLValue]) throws -> SqlRows {
        try locked {
            try migrate()

            return try statement(sql) { select in
                bind(params, to: select)

                let count = sqlite3_column_count(select)
                let columns = (0 ..< count).map { String(cString: sqlite3_column_name(select, $0)) }
                var rows: [[Any]] = []

                while true {
                    switch sqlite3_step(select) {
                    case SQLITE_ROW: rows.append(try (0 ..< count).map { try value(select, column: $0).json })
                    case SQLITE_DONE: return SqlRows(columns: columns, rows: rows)
                    default: throw failure("run \(sql)")
                    }
                }
            }
        }
    }

    /// One transaction: every statement lands, or none.
    func write(_ statements: [SqlStatement]) throws {
        try locked {
            try migrate()
            try inTransaction {
                for each in statements {
                    try statement(each.sql) { write in
                        bind(try each.params.map(KuitoSQLValue.init), to: write)
                        try step(write, "run \(each.sql)")
                    }
                }
            }
        }
    }

    /// The migrations in kuito.config.ts, which the CLI writes into the
    /// bundle, applied once each, in order, before the app's first query.
    /// `kuito_migrations` keeps each one's SQL, so an edited migration that
    /// already ran fails instead of leaving devices with different schemas.
    private func migrate() throws {
        if migrated { return }

        let declared = try Self.migrations()

        try execute("CREATE TABLE IF NOT EXISTS kuito_migrations (version INTEGER PRIMARY KEY NOT NULL, statements TEXT NOT NULL)")

        let applied = try statement("SELECT statements FROM kuito_migrations ORDER BY version") { select in
            var applied: [String] = []

            while sqlite3_step(select) == SQLITE_ROW { applied.append(text(select, column: 0)) }

            return applied
        }

        guard applied.count <= declared.count else {
            throw KuitoModuleError("ERR_STORAGE", "The database ran \(applied.count) migrations, but kuito.config.ts declares \(declared.count). Migrations are append-only: restore the ones removed.")
        }

        for (version, statements) in declared.enumerated() {
            let sql = statements.joined(separator: ";\n")

            if version < applied.count {
                guard applied[version] == sql else {
                    throw KuitoModuleError("ERR_STORAGE", "migrations[\(version)] in kuito.config.ts changed after it ran. Restore it, and append a new migration for the change.")
                }

                continue
            }

            do {
                try inTransaction {
                    for each in statements { try execute(each) }
                    try statement("INSERT INTO kuito_migrations (version, statements) VALUES (?, ?)") { record in
                        bind([.integer(Int64(version)), .text(sql)], to: record)
                        try step(record, "record migrations[\(version)]")
                    }
                }
            } catch let error as KuitoModuleError {
                throw KuitoModuleError("ERR_STORAGE", "migrations[\(version)] in kuito.config.ts failed: \(error.message)")
            }
        }

        migrated = true
    }

    private static func migrations() throws -> [[String]] {
        guard let url = Bundle.main.url(forResource: "kuito-migrations", withExtension: "json") else { return [] }

        do {
            return try JSONDecoder().decode([[String]].self, from: Data(contentsOf: url))
        } catch {
            throw KuitoModuleError("ERR_STORAGE", "Could not read the migrations in kuito-migrations.json: \(error)")
        }
    }

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }

        return try body()
    }

    private func transaction(_ body: () throws -> Void) throws {
        try locked { try inTransaction(body) }
    }

    /// All of `body`'s writes land, or none do. The caller holds the lock.
    private func inTransaction(_ body: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")

        do {
            try body()
            try execute("COMMIT")
        } catch {
            sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
            throw error
        }
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw failure(sql) }
    }

    private func statement<T>(_ sql: String, _ body: (OpaquePointer) throws -> T) throws -> T {
        var prepared: OpaquePointer?

        guard sqlite3_prepare_v2(db, sql, -1, &prepared, nil) == SQLITE_OK, let prepared else { throw failure(sql) }
        defer { sqlite3_finalize(prepared) }

        return try body(prepared)
    }

    private func step(_ statement: OpaquePointer, _ what: String) throws {
        guard sqlite3_step(statement) == SQLITE_DONE else { throw failure(what) }
    }

    // Explicit byte lengths keep strings with NUL characters whole.
    private func bind(_ value: String, to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_text(statement, index, value, Int32(value.utf8.count), Self.transient)
    }

    private func bind(_ values: [KuitoSQLValue], to statement: OpaquePointer) {
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)

            switch value {
            case let .integer(integer): sqlite3_bind_int64(statement, index, integer)
            case let .real(real): sqlite3_bind_double(statement, index, real)
            case let .text(text): bind(text, to: statement, at: index)
            case .null: sqlite3_bind_null(statement, index)
            }
        }
    }

    private func value(_ statement: OpaquePointer, column: Int32) throws -> KuitoSQLValue {
        switch sqlite3_column_type(statement, column) {
        case SQLITE_INTEGER: return .integer(sqlite3_column_int64(statement, column))
        case SQLITE_FLOAT: return .real(sqlite3_column_double(statement, column))
        case SQLITE_TEXT: return .text(text(statement, column: column))
        case SQLITE_NULL: return .null
        default:
            let name = String(cString: sqlite3_column_name(statement, column))

            throw KuitoModuleError("ERR_STORAGE", "Column \(name) holds a BLOB, which has no JSON form; store text or numbers.")
        }
    }

    private func text(_ statement: OpaquePointer, column: Int32) -> String {
        guard let bytes = sqlite3_column_text(statement, column) else { return "" }

        return String(decoding: UnsafeBufferPointer(start: bytes, count: Int(sqlite3_column_bytes(statement, column))), as: UTF8.self)
    }

    private func failure(_ what: String) -> KuitoModuleError {
        KuitoModuleError("ERR_STORAGE", "Storage could not \(what): \(String(cString: sqlite3_errmsg(db)))")
    }
}
